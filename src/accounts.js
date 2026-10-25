const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_FILE = path.resolve(process.env.ACCOUNTS_FILE || path.join(process.cwd(), 'data', 'accounts.json'));
const DEFAULTS = {
  port: 25565,
  version: '',
  authMode: 'microsoft',
  autoReconnect: true,
  autoLogin: false,
  loginCommand: '/login {password}',
  autoMessage: false,
  autoMessageText: '',
  autoMessageIntervalSeconds: 300,
  tradeCommand: ''
};

function readAccounts() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function writeAccounts(accounts) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tempFile = DATA_FILE + '.tmp';
  fs.writeFileSync(tempFile, JSON.stringify(accounts, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tempFile, DATA_FILE);
}

function getEncryptionKey() {
  const secret = process.env.ACCOUNT_ENCRYPTION_KEY || '';
  if (secret.length < 32) throw new Error('ACCOUNT_ENCRYPTION_KEY must contain at least 32 characters.');
  return crypto.scryptSync(secret, 'mc-afk-client-account-password-v1', 32);
}

function encryptPassword(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') };
}

function decryptPassword(record) {
  if (!record) return '';
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(record.data, 'base64')), decipher.final()]).toString('utf8');
}

function bounded(value, fallback, limit) {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, limit);
}

function normalize(input, previous) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Account data must be an object.');
  const account = {
    id: previous ? previous.id : crypto.randomUUID(),
    name: bounded(input.name, previous ? previous.name : '', 60),
    username: bounded(input.username, previous ? previous.username : '', 120),
    host: bounded(input.host, previous ? previous.host : '', 255),
    port: Number(input.port === undefined && previous ? previous.port : input.port),
    version: bounded(input.version, previous ? previous.version : DEFAULTS.version, 40),
    authMode: input.authMode === undefined && previous ? previous.authMode : input.authMode,
    autoReconnect: typeof input.autoReconnect === 'boolean' ? input.autoReconnect : previous ? previous.autoReconnect : DEFAULTS.autoReconnect,
    autoLogin: typeof input.autoLogin === 'boolean' ? input.autoLogin : previous ? previous.autoLogin : DEFAULTS.autoLogin,
    loginCommand: bounded(input.loginCommand, previous ? previous.loginCommand : DEFAULTS.loginCommand, 100),
    autoMessage: typeof input.autoMessage === 'boolean' ? input.autoMessage : previous ? previous.autoMessage : DEFAULTS.autoMessage,
    autoMessageText: bounded(input.autoMessageText, previous ? previous.autoMessageText : DEFAULTS.autoMessageText, 200),
    autoMessageIntervalSeconds: Number(input.autoMessageIntervalSeconds === undefined && previous ? previous.autoMessageIntervalSeconds : input.autoMessageIntervalSeconds),
    tradeCommand: bounded(input.tradeCommand, previous ? previous.tradeCommand : DEFAULTS.tradeCommand, 200),
    createdAt: previous ? previous.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    serverLoginPassword: previous ? previous.serverLoginPassword || null : null
  };
  if (!account.name || !account.username || !account.host) throw new Error('Name, Minecraft username, and server address are required.');
  if (!Number.isInteger(account.port) || account.port < 1 || account.port > 65535) throw new Error('Port must be between 1 and 65535.');
  if (!['microsoft', 'offline'].includes(account.authMode)) account.authMode = previous ? previous.authMode : DEFAULTS.authMode;
  if (!Number.isInteger(account.autoMessageIntervalSeconds)) account.autoMessageIntervalSeconds = previous ? previous.autoMessageIntervalSeconds : DEFAULTS.autoMessageIntervalSeconds;
  account.autoMessageIntervalSeconds = Math.max(30, Math.min(account.autoMessageIntervalSeconds, 86400));

  if (input.clearServerLoginPassword === true) account.serverLoginPassword = null;
  if (typeof input.serverLoginPassword === 'string' && input.serverLoginPassword.length > 0) {
    if (input.serverLoginPassword.length > 200) throw new Error('Server login password is too long.');
    account.serverLoginPassword = encryptPassword(input.serverLoginPassword);
  }
  return account;
}

function toPublic(account) {
  const { serverLoginPassword, ...publicAccount } = account;
  return { ...publicAccount, serverLoginPasswordConfigured: Boolean(serverLoginPassword) };
}

function listAccounts() {
  return readAccounts().map(toPublic).sort((a, b) => a.name.localeCompare(b.name));
}

function getAccount(id) {
  const account = readAccounts().find((entry) => entry.id === id);
  return account ? toPublic(account) : null;
}

function getAccountForBot(id) {
  const account = readAccounts().find((entry) => entry.id === id);
  if (!account) return null;
  return { ...account, serverLoginPassword: decryptPassword(account.serverLoginPassword) };
}

function saveAccount(input, id) {
  const accounts = readAccounts();
  const index = id ? accounts.findIndex((entry) => entry.id === id) : -1;
  if (id && index < 0) throw new Error('Account not found.');
  const account = normalize(input, index >= 0 ? accounts[index] : null);
  if (index >= 0) accounts[index] = account;
  else accounts.push(account);
  writeAccounts(accounts);
  return toPublic(account);
}

function deleteAccount(id) {
  const accounts = readAccounts();
  const index = accounts.findIndex((entry) => entry.id === id);
  if (index < 0) return false;
  accounts.splice(index, 1);
  writeAccounts(accounts);
  return true;
}

module.exports = { DATA_FILE, listAccounts, getAccount, getAccountForBot, saveAccount, deleteAccount, encryptPassword, decryptPassword, toPublic };
