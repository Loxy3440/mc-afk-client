const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-afk-accounts-'));
process.env.ACCOUNTS_FILE = path.join(temp, 'accounts.json');
process.env.ACCOUNT_ENCRYPTION_KEY = 'test-encryption-key-with-more-than-32-characters';
const accounts = require('../src/accounts');

test('stores account passwords encrypted and only reveals a boolean', () => {
  const saved = accounts.saveAccount({
    name: 'Primary', username: 'player@example.test', host: 'mc.example.test', port: 25565,
    authMode: 'microsoft', autoLogin: true, serverLoginPassword: 'server-login-secret',
    autoMessage: true, autoMessageText: 'hello', autoMessageIntervalSeconds: 45
  });
  assert.equal(saved.serverLoginPasswordConfigured, true);
  assert.equal(JSON.stringify(saved).includes('server-login-secret'), false);
  const botAccount = accounts.getAccountForBot(saved.id);
  assert.equal(botAccount.serverLoginPassword, 'server-login-secret');
  const disk = fs.readFileSync(process.env.ACCOUNTS_FILE, 'utf8');
  assert.equal(disk.includes('server-login-secret'), false);
});

test('rejects incomplete account records', () => {
  assert.throws(() => accounts.saveAccount({ name: '', username: '', host: '' }), /required/);
});

test.after(() => fs.rmSync(temp, { recursive: true, force: true }));
