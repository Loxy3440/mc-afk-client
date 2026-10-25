const mineflayer = require('mineflayer');
const path = require('node:path');
const { mineflayer: startViewer } = require('prismarine-viewer');
const { getAccountForBot, getAccount } = require('./accounts');

const sessions = new Map();
const portBaseValue = Number.parseInt(process.env.VIEWER_PORT_BASE || '32000', 10);
const VIEWER_PORT_BASE = Number.isInteger(portBaseValue) && portBaseValue > 1024 && portBaseValue < 64000 ? portBaseValue : 32000;
const maxValue = Number.parseInt(process.env.MAX_ACTIVE_BOTS || '3', 10);
const MAX_ACTIVE_BOTS = Number.isInteger(maxValue) ? Math.max(1, Math.min(maxValue, 12)) : 3;
let nextPortOffset = 0;

function viewerPortForNewSession() {
  const used = new Set([...sessions.values()].map((session) => session.viewerPort).filter(Boolean));
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const port = VIEWER_PORT_BASE + ((nextPortOffset + attempt) % 500);
    if (port < 64000 && !used.has(port)) {
      nextPortOffset = (nextPortOffset + attempt + 1) % 500;
      return port;
    }
  }
  throw new Error('No viewer port is available.');
}

function cleanReason(reason) {
  let text;
  try { text = typeof reason === 'string' ? reason : JSON.stringify(reason); } catch { text = String(reason); }
  return String(text || 'Unknown connection error').replace(/(password|secret|token)\s*[:=]\s*[^\s,]+/gi, '$1=[redacted]').slice(0, 240);
}

function publicState(id) {
  const account = getAccount(id);
  if (!account) return null;
  const session = sessions.get(id);
  return {
    account,
    status: session ? session.status : 'offline',
    lastError: session ? session.lastError : '',
    connectedAt: session ? session.connectedAt : null,
    reconnectInMs: session ? session.reconnectInMs : 0,
    viewerReady: Boolean(session && session.viewerReady && session.status === 'online')
  };
}

function getViewerPort(id) {
  const session = sessions.get(id);
  return session && session.viewerReady && session.status === 'online' ? session.viewerPort : null;
}

function closeViewer(session) {
  if (session.bot && session.bot.viewer && typeof session.bot.viewer.close === 'function') {
    try { session.bot.viewer.close(); } catch {}
  }
  session.viewerReady = false;
  session.viewerPort = null;
}

function scheduleReconnect(session) {
  if (session.manualStop || session.reconnectTimer) return;
  const account = getAccount(session.id);
  if (!account || !account.autoReconnect) {
    sessions.delete(session.id);
    return;
  }
  const delay = Math.min(30000, 2000 * (2 ** Math.min(session.reconnectAttempts, 4)));
  session.reconnectAttempts += 1;
  session.reconnectInMs = delay;
  session.reconnectTimer = setTimeout(() => {
    session.reconnectTimer = null;
    if (!session.manualStop && sessions.get(session.id) === session) connect(session);
  }, delay);
}

function connect(session) {
  let account;
  try {
    account = getAccountForBot(session.id);
    if (!account) throw new Error('Account not found.');
    if (!account.host || !account.username) throw new Error('Account name, username, and server are required.');
    session.status = 'connecting';
    session.lastError = '';
    session.reconnectInMs = 0;

    const current = mineflayer.createBot({
      host: account.host,
      port: account.port,
      username: account.username,
      auth: account.authMode,
      version: account.version || false,
      profilesFolder: path.join(process.cwd(), '.minecraft-auth', session.id)
    });
    session.bot = current;

    current.once('spawn', () => {
      if (sessions.get(session.id) !== session || session.bot !== current) return;
      session.status = 'online';
      session.lastError = '';
      session.connectedAt = Date.now();
      session.reconnectAttempts = 0;
      session.viewerPort = viewerPortForNewSession();
      startViewer(current, { port: session.viewerPort, prefix: '/view/' + session.id, firstPerson: true, viewDistance: 6 });
      session.viewerReady = true;

      if (account.autoLogin) {
        if (!account.serverLoginPassword) {
          session.lastError = 'Auto-login enabled, but this account has no saved server /login password.';
        } else {
          const command = account.loginCommand.includes('{password}')
            ? account.loginCommand.replace(/\{password\}/g, account.serverLoginPassword)
            : account.loginCommand + ' ' + account.serverLoginPassword;
          setTimeout(() => {
            if (sessions.get(session.id) === session && session.bot === current && session.status === 'online') current.chat(command);
          }, 2500);
        }
      }

      if (account.autoMessage && account.autoMessageText) {
        session.messageTimer = setInterval(() => {
          if (sessions.get(session.id) === session && session.bot === current && session.status === 'online') current.chat(account.autoMessageText);
        }, account.autoMessageIntervalSeconds * 1000);
      }
    });

    current.on('kicked', (reason) => { session.lastError = cleanReason(reason); });
    current.on('error', (error) => { session.lastError = cleanReason(error && error.message ? error.message : error); });
    current.once('end', (reason) => {
      if (session.bot !== current) return;
      if (session.messageTimer) clearInterval(session.messageTimer);
      session.messageTimer = null;
      closeViewer(session);
      session.bot = null;
      session.status = 'offline';
      session.connectedAt = null;
      if (reason) session.lastError = cleanReason(reason);
      scheduleReconnect(session);
    });
  } catch (error) {
    session.status = 'offline';
    session.lastError = cleanReason(error && error.message ? error.message : error);
    if (session.manualStop) sessions.delete(session.id);
    else scheduleReconnect(session);
  }
}

function startAccount(id) {
  const existing = sessions.get(id);
  if (existing) return publicState(id);
  if (!getAccount(id)) throw new Error('Account not found.');
  if (sessions.size >= MAX_ACTIVE_BOTS) throw new Error('Active session limit reached (' + MAX_ACTIVE_BOTS + '). Stop another account first.');
  const session = {
    id,
    status: 'connecting',
    lastError: '',
    connectedAt: null,
    viewerPort: null,
    viewerReady: false,
    reconnectInMs: 0,
    reconnectAttempts: 0,
    reconnectTimer: null,
    messageTimer: null,
    manualStop: false,
    bot: null
  };
  sessions.set(id, session);
  connect(session);
  return publicState(id);
}

function stopAccount(id) {
  const session = sessions.get(id);
  if (!session) return publicState(id);
  session.manualStop = true;
  if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
  if (session.messageTimer) clearInterval(session.messageTimer);
  session.reconnectTimer = null;
  session.messageTimer = null;
  closeViewer(session);
  if (!session.bot) {
    session.status = 'offline';
    sessions.delete(id);
    return publicState(id);
  }
  const current = session.bot;
  session.status = 'stopping';
  current.quit('Stopped from account panel');
  setTimeout(() => {
    if (sessions.get(id) === session && session.bot === current) {
      session.bot = null;
      session.status = 'offline';
      sessions.delete(id);
    }
  }, 3000);
  return publicState(id);
}

function sendChat(id, message) {
  const session = sessions.get(id);
  if (!session || !session.bot || session.status !== 'online') throw new Error('This account is not online.');
  const text = String(message || '').trim();
  if (!text || text.length > 200) throw new Error('Message must contain 1 to 200 characters.');
  session.bot.chat(text);
  return { sent: true };
}

function sendTradeCommand(id) {
  const account = getAccount(id);
  if (!account || !account.tradeCommand) throw new Error('Set a trade command on this account first.');
  return sendChat(id, account.tradeCommand);
}

function stopAll() {
  for (const id of sessions.keys()) stopAccount(id);
}

module.exports = { publicState, getViewerPort, startAccount, stopAccount, sendChat, sendTradeCommand, stopAll, MAX_ACTIVE_BOTS };
