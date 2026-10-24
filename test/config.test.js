const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeConfig } = require('../src/config');

test('keeps only known settings and validates port', () => {
  const config = normalizeConfig({ host: ' mc.example.net ', port: 70000, username: 'player', extraSecret: 'not-allowed' });
  assert.equal(config.host, 'mc.example.net');
  assert.equal(config.port, 25565);
  assert.equal(config.username, 'player');
  assert.equal(Object.hasOwn(config, 'extraSecret'), false);
});

test('limits auto-message interval to at least 30 seconds', () => {
  assert.equal(normalizeConfig({ autoMessageIntervalSeconds: 1 }).autoMessageIntervalSeconds, 30);
});

test('accepts only supported authentication modes', () => {
  assert.equal(normalizeConfig({ authMode: 'offline' }).authMode, 'offline');
  assert.notEqual(normalizeConfig({ authMode: 'unknown' }).authMode, 'unknown');
});
