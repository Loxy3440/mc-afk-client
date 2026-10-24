require('dotenv').config();
const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const { loadConfig, saveConfig } = require('./config');
const botControl = require('./bot');

const dashboardPassword = process.env.DASHBOARD_PASSWORD || '';
if (dashboardPassword.length < 16) {
  console.error('Set DASHBOARD_PASSWORD to a unique value with at least 16 characters.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);

function constantTimeEqual(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue));
  const right = Buffer.from(String(rightValue));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function authenticate(req, res, next) {
  if (req.path === '/health') return next();
  const header = req.get('authorization') || '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      const username = separator >= 0 ? decoded.slice(0, separator) : '';
      const password = separator >= 0 ? decoded.slice(separator + 1) : '';
      if (constantTimeEqual(username, 'admin') && constantTimeEqual(password, dashboardPassword)) return next();
    } catch {}
  }
  res.set('WWW-Authenticate', 'Basic realm="MC AFK Panel", charset="UTF-8"');
  return res.status(401).send('Panel girişi gerekli.');
}

app.get('/health', (req, res) => res.json({ ok: true }));
app.use(authenticate);
app.use(express.json({ limit: '20kb', type: 'application/json' }));

app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || !req.get('origin')) return next();
  try {
    if (new URL(req.get('origin')).host !== req.get('host')) {
      return res.status(403).json({ error: 'Cross-origin request rejected.' });
    }
  } catch {
    return res.status(403).json({ error: 'Invalid request origin.' });
  }
  return next();
});

app.get('/api/state', (req, res) => res.json(botControl.getState()));

app.post('/api/config', (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Settings must be a JSON object.' });
  }
  try {
    return res.json({ config: saveConfig(req.body) });
  } catch {
    return res.status(400).json({ error: 'Settings could not be saved.' });
  }
});

app.post('/api/bot/start', (req, res) => {
  try {
    return res.json(botControl.startBot());
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post('/api/bot/stop', (req, res) => res.json(botControl.stopBot()));

app.post('/api/chat', (req, res) => {
  try {
    return res.json(botControl.sendChat(req.body && req.body.message));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post('/api/trade', (req, res) => {
  try {
    return res.json(botControl.sendTradeCommand());
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html' }));

const port = Number.parseInt(process.env.PORT || '3000', 10);
const server = app.listen(port, '0.0.0.0', () => {
  console.log('MC AFK control panel listening on port ' + port);
});

function shutdown() {
  botControl.stopBot();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
