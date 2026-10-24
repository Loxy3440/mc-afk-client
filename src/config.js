const fs = require('node:fs');
const path = require('node:path');

const CONFIG_PATH = path.resolve(process.env.APP_CONFIG_PATH || path.join(process.cwd(), 'config.json'));
const envAuthMode = process.env.MC_AUTH_MODE === 'offline' ? 'offline' : 'microsoft';
const envPort = Number.parseInt(process.env.MC_SERVER_PORT || '25565', 10);

const DEFAULT_CONFIG = Object.freeze({
  host: process.env.MC_SERVER_HOST || '',
  port: Number.isInteger(envPort) && envPort >= 1 && envPort <= 65535 ? envPort : 25565,
  version: process.env.MC_VERSION || '',
  username: process.env.MC_USERNAME || '',
  authMode: envAuthMode,
  autoReconnect: true,
  autoLogin: false,
  loginCommand: '/login {password}',
  autoMessage: false,
  autoMessageText: '',
  autoMessageIntervalSeconds: 300,
  tradeCommand: ''
});

const STRING_LIMITS = {
  host: 255,
  version: 40,
  username: 120,
  loginCommand: 100,
  autoMessageText: 200,
  tradeCommand: 200
};

function boundedString(value, fallback, maxLength) {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, maxLength);
}

function normalizeConfig(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const output = { ...DEFAULT_CONFIG };
  for (const [key, limit] of Object.entries(STRING_LIMITS)) {
    output[key] = boundedString(input[key], DEFAULT_CONFIG[key], limit);
  }
  const port = Number(input.port);
  output.port = Number.isInteger(port) && port >= 1 && port <= 65535 ? port : DEFAULT_CONFIG.port;
  output.authMode = input.authMode === 'offline' || input.authMode === 'microsoft' ? input.authMode : DEFAULT_CONFIG.authMode;
  for (const key of ['autoReconnect', 'autoLogin', 'autoMessage']) {
    if (typeof input[key] === 'boolean') output[key] = input[key];
  }
  const interval = Number(input.autoMessageIntervalSeconds);
  output.autoMessageIntervalSeconds = Number.isInteger(interval)
    ? Math.max(30, Math.min(interval, 86400))
    : DEFAULT_CONFIG.autoMessageIntervalSeconds;
  return output;
}

function loadConfig() {
  let diskConfig = {};
  try {
    diskConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return normalizeConfig({ ...DEFAULT_CONFIG, ...diskConfig });
}

function saveConfig(changes) {
  const current = loadConfig();
  const next = normalizeConfig({ ...current, ...changes });
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  return next;
}

module.exports = { CONFIG_PATH, DEFAULT_CONFIG, normalizeConfig, loadConfig, saveConfig };
