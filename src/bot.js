const mineflayer = require('mineflayer');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { loadConfig } = require('./config');

const events = new EventEmitter();
const state = { status: 'offline', lastError: '', connectedAt: null, reconnectInMs: 0 };
let bot = null;
let manuallyStopped = true;
let reconnectTimer = null;
let messageTimer = null;
let reconnectAttempts = 0;

function publish() {
  events.emit('change', getState());
}

function cleanReason(reason) {
  let text;
  try {
    text = typeof reason === 'string' ? reason : JSON.stringify(reason);
  } catch {
    text = String(reason);
  }
  return String(text || 'Unknown connection error')
    .replace(/(password|secret|token)\s*[:=]\s*[^\s,]+/gi, '$1=[redacted]')
    .slice(0, 240);
}

function getState() {
  const config = loadConfig();
  return {
    status: state.status,
    lastError: state.lastError,
    connectedAt: state.connectedAt,
    reconnectInMs: state.reconnectInMs,
    reconnectAttempts,
    username: config.username,
    host: config.host,
    port: config.port,
    authMode: config.authMode,
    loginSecretConfigured: Boolean(process.env.MC_LOGIN_PASSWORD),
    config
  };
}

function clearActivityTimers() {
  if (messageTimer) clearInterval(messageTimer);
  messageTimer = null;
}

function scheduleReconnect() {
  if (manuallyStopped || reconnectTimer || !loadConfig().autoReconnect) return;
  const delay = Math.min(30000, 2000 * (2 ** Math.min(reconnectAttempts, 4)));
  reconnectAttempts += 1;
  state.reconnectInMs = delay;
  publish();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!manuallyStopped) connectBot();
  }, delay);
}

function connectBot() {
  const config = loadConfig();
  if (!config.host) throw new Error('Önce sunucu adresini ayarla.');
  if (!config.username) throw new Error('Önce Minecraft kullanıcı adını ayarla.');

  state.status = 'connecting';
  state.lastError = '';
  state.reconnectInMs = 0;
  publish();

  try {
    const current = mineflayer.createBot({
      host: config.host,
      port: config.port,
      username: config.username,
      auth: config.authMode,
      version: config.version || false,
      profilesFolder: path.join(process.cwd(), '.minecraft-auth')
    });
    bot = current;

    current.once('spawn', () => {
      if (bot !== current) return;
      state.status = 'online';
      state.lastError = '';
      state.connectedAt = Date.now();
      state.reconnectInMs = 0;
      reconnectAttempts = 0;
      publish();

      if (config.autoLogin) {
        const loginSecret = process.env.MC_LOGIN_PASSWORD;
        if (!loginSecret) {
          state.lastError = 'Otomatik giriş için MC_LOGIN_PASSWORD secret değerini ekle.';
          publish();
        } else {
          const command = config.loginCommand.includes('{password}')
            ? config.loginCommand.replace(/\{password\}/g, loginSecret)
            : config.loginCommand + ' ' + loginSecret;
          setTimeout(() => {
            if (bot === current && state.status === 'online') current.chat(command);
          }, 2500);
        }
      }

      clearActivityTimers();
      if (config.autoMessage && config.autoMessageText) {
        messageTimer = setInterval(() => {
          if (bot === current && state.status === 'online') current.chat(config.autoMessageText);
        }, config.autoMessageIntervalSeconds * 1000);
      }
    });

    current.on('kicked', (reason) => {
      state.lastError = cleanReason(reason);
      publish();
    });
    current.on('error', (error) => {
      state.lastError = cleanReason(error && error.message ? error.message : error);
      publish();
    });
    current.once('end', (reason) => {
      if (bot !== current) return;
      bot = null;
      clearActivityTimers();
      state.status = 'offline';
      state.connectedAt = null;
      if (reason) state.lastError = cleanReason(reason);
      publish();
      scheduleReconnect();
    });
  } catch (error) {
    state.status = 'offline';
    state.lastError = cleanReason(error && error.message ? error.message : error);
    publish();
    scheduleReconnect();
  }
}

function startBot() {
  if (bot || state.status === 'connecting' || state.status === 'online') return getState();
  manuallyStopped = false;
  reconnectAttempts = 0;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  connectBot();
  return getState();
}

function stopBot() {
  manuallyStopped = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  state.reconnectInMs = 0;
  clearActivityTimers();
  const current = bot;
  if (!current) {
    state.status = 'offline';
    state.connectedAt = null;
    publish();
    return getState();
  }
  state.status = 'stopping';
  publish();
  current.quit('Stopped from web panel');
  setTimeout(() => {
    if (bot === current) {
      bot = null;
      state.status = 'offline';
      state.connectedAt = null;
      publish();
    }
  }, 3000);
  return getState();
}

function sendChat(message) {
  if (!bot || state.status !== 'online') throw new Error('Bot çevrimiçi değil.');
  const text = String(message || '').trim();
  if (!text) throw new Error('Mesaj boş olamaz.');
  if (text.length > 200) throw new Error('Mesaj en fazla 200 karakter olabilir.');
  bot.chat(text);
  return { sent: true };
}

function sendTradeCommand() {
  const command = loadConfig().tradeCommand;
  if (!command) throw new Error('Önce ayarlardan trade komutunu yaz.');
  return sendChat(command);
}

module.exports = { events, getState, startBot, stopBot, sendChat, sendTradeCommand };
