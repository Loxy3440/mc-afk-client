require('dotenv').config();
const crypto = require('node:crypto');
const http = require('node:http');
const path = require('node:path');
const express = require('express');
const accounts = require('./accounts');
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

function isAuthorized(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    const username = separator >= 0 ? decoded.slice(0, separator) : '';
    const password = separator >= 0 ? decoded.slice(separator + 1) : '';
    return constantTimeEqual(username, 'admin') && constantTimeEqual(password, dashboardPassword);
  } catch { return false; }
}

function authenticate(req, res, next) {
  if (req.path === '/health') return next();
  if (isAuthorized(req)) return next();
  res.set('WWW-Authenticate', 'Basic realm="MC AFK Panel", charset="UTF-8"');
  return res.status(401).send('Panel login required.');
}

function validViewerCookie(req, accountId) {
  const header = req.headers.cookie || '';
  const name = 'view_' + accountId;
  const item = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(name + '='));
  if (!item) return false;
  const token = decodeURIComponent(item.slice(name.length + 1));
  const parts = token.split('.');
  if (parts.length !== 2 || !/^\d+$/.test(parts[0])) return false;
  const expires = Number(parts[0]);
  if (expires < Date.now()) return false;
  const expected = crypto.createHmac('sha256', dashboardPassword).update(accountId + '.' + parts[0]).digest('hex');
  return constantTimeEqual(parts[1], expected);
}

app.get('/health', (req, res) => res.json({ ok: true }));
app.use(authenticate);
app.use(express.json({ limit: '20kb', type: 'application/json' }));
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || !req.get('origin')) return next();
  try {
    if (new URL(req.get('origin')).host !== req.get('host')) return res.status(403).json({ error: 'Cross-origin request rejected.' });
  } catch { return res.status(403).json({ error: 'Invalid request origin.' }); }
  return next();
});

app.get('/api/accounts', (req, res) => res.json({ accounts: accounts.listAccounts(), maxActiveBots: botControl.MAX_ACTIVE_BOTS }));
app.post('/api/accounts', (req, res) => {
  try { return res.status(201).json({ account: accounts.saveAccount(req.body) }); }
  catch (error) { return res.status(400).json({ error: error.message }); }
});
app.get('/api/accounts/:id', (req, res) => {
  const account = accounts.getAccount(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found.' });
  return res.json({ account });
});
app.patch('/api/accounts/:id', (req, res) => {
  const state = botControl.publicState(req.params.id);
  if (!state) return res.status(404).json({ error: 'Account not found.' });
  if (state.status !== 'offline') return res.status(409).json({ error: 'Stop this account before changing its settings.' });
  try { return res.json({ account: accounts.saveAccount(req.body, req.params.id) }); }
  catch (error) { return res.status(400).json({ error: error.message }); }
});
app.delete('/api/accounts/:id', (req, res) => {
  const state = botControl.publicState(req.params.id);
  if (!state) return res.status(404).json({ error: 'Account not found.' });
  if (state.status !== 'offline') return res.status(409).json({ error: 'Stop this account before deleting it.' });
  accounts.deleteAccount(req.params.id);
  return res.json({ deleted: true });
});
app.get('/api/accounts/:id/state', (req, res) => {
  const state = botControl.publicState(req.params.id);
  return state ? res.json(state) : res.status(404).json({ error: 'Account not found.' });
});
app.post('/api/accounts/:id/start', (req, res) => {
  try { return res.json(botControl.startAccount(req.params.id)); }
  catch (error) { return res.status(400).json({ error: error.message }); }
});
app.post('/api/accounts/:id/stop', (req, res) => {
  const state = botControl.publicState(req.params.id);
  return state ? res.json(botControl.stopAccount(req.params.id)) : res.status(404).json({ error: 'Account not found.' });
});
app.post('/api/accounts/:id/chat', (req, res) => {
  try { return res.json(botControl.sendChat(req.params.id, req.body && req.body.message)); }
  catch (error) { return res.status(400).json({ error: error.message }); }
});
app.post('/api/accounts/:id/trade', (req, res) => {
  try { return res.json(botControl.sendTradeCommand(req.params.id)); }
  catch (error) { return res.status(400).json({ error: error.message }); }
});

app.get('/', (req, res) => res.redirect('/accounts'));
app.get('/accounts', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.get('/account/:id', (req, res, next) => {
  if (!accounts.getAccount(req.params.id)) return res.status(404).send('Account not found.');
  const expires = String(Date.now() + 60 * 60 * 1000);
  const signature = crypto.createHmac('sha256', dashboardPassword).update(req.params.id + '.' + expires).digest('hex');
  res.setHeader('Set-Cookie', 'view_' + req.params.id + '=' + expires + '.' + signature + '; Path=/view/' + req.params.id + '; HttpOnly; SameSite=Strict; Max-Age=3600' + (req.secure ? '; Secure' : ''));
  res.setHeader('Cache-Control', 'no-store');
  return res.sendFile(path.join(__dirname, '..', 'public', 'account.html'), (error) => { if (error) next(error); });
});

function viewerIdFromPath(url) {
  const match = /^\/view\/([0-9a-f-]{36})(?:\/|$)/i.exec(url);
  return match ? match[1] : null;
}

app.use((req, res, next) => {
  const accountId = viewerIdFromPath(req.url);
  if (!accountId) return next();
  const port = botControl.getViewerPort(accountId);
  if (!port) return res.status(503).send('The Minecraft world view is not ready yet.');
  const upstream = http.request({
    hostname: '127.0.0.1', port, path: req.url, method: req.method,
    headers: { ...req.headers, host: '127.0.0.1:' + port }
  }, (upstreamResponse) => {
    res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(res);
  });
  upstream.on('error', () => { if (!res.headersSent) res.status(502).send('Viewer connection failed.'); else res.end(); });
  req.pipe(upstream);
});

app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { index: false }));

const port = Number.parseInt(process.env.PORT || '3000', 10);
const server = http.createServer(app);
server.on('upgrade', (req, socket, head) => {
  const accountId = viewerIdFromPath(req.url || '');
  if (!accountId) { socket.destroy(); return; }
  const sameOrigin = !req.headers.origin || (() => { try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; } })();
  if (!sameOrigin || (!isAuthorized(req) && !validViewerCookie(req, accountId))) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  const viewerPort = botControl.getViewerPort(accountId);
  if (!viewerPort) { socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
  const upstream = http.request({ hostname: '127.0.0.1', port: viewerPort, path: req.url, method: 'GET', headers: { ...req.headers, host: '127.0.0.1:' + viewerPort } });
  upstream.on('upgrade', (response, upstreamSocket, upstreamHead) => {
    const headers = Object.entries(response.headers).map(([key, value]) => key + ': ' + (Array.isArray(value) ? value.join(', ') : value)).join('\r\n');
    socket.write('HTTP/1.1 101 Switching Protocols\r\n' + headers + '\r\n\r\n');
    if (head && head.length) upstreamSocket.write(head);
    if (upstreamHead && upstreamHead.length) socket.write(upstreamHead);
    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);
    socket.on('error', () => upstreamSocket.destroy());
    upstreamSocket.on('error', () => socket.destroy());
  });
  upstream.on('response', (response) => {
    socket.write('HTTP/1.1 ' + (response.statusCode || 502) + ' ' + (response.statusMessage || 'Bad Gateway') + '\r\nConnection: close\r\n\r\n');
    socket.destroy();
  });
  upstream.on('error', () => socket.destroy());
  upstream.end();
});

const webServer = server.listen(port, '0.0.0.0', () => console.log('MC AFK account panel listening on port ' + port));
function shutdown() {
  botControl.stopAll();
  webServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
