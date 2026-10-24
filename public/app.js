const $ = (id) => document.getElementById(id);
const settingsForm = $('settings-form');
let settingsLoaded = false;
let refreshing = false;

async function request(path, options) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options && options.headers ? options.headers : {}) }
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data && data.error ? data.error : 'İstek tamamlanamadı.');
  return data;
}

function showNotice(message, isError) {
  const notice = $('notice');
  notice.textContent = message || '';
  notice.classList.toggle('error', Boolean(isError));
  if (message) window.setTimeout(() => { if (notice.textContent === message) notice.textContent = ''; }, 5000);
}

function fillSettings(config) {
  $('host').value = config.host || '';
  $('port').value = config.port || 25565;
  $('version').value = config.version || '';
  $('username').value = config.username || '';
  $('authMode').value = config.authMode || 'microsoft';
  $('autoReconnect').checked = Boolean(config.autoReconnect);
  $('autoLogin').checked = Boolean(config.autoLogin);
  $('loginCommand').value = config.loginCommand || '/login {password}';
  $('autoMessage').checked = Boolean(config.autoMessage);
  $('autoMessageText').value = config.autoMessageText || '';
  $('autoMessageIntervalSeconds').value = config.autoMessageIntervalSeconds || 300;
  $('tradeCommand').value = config.tradeCommand || '';
}

function render(data) {
  const status = data.status || 'offline';
  const statusText = status === 'online' ? 'Çevrimiçi' : status === 'connecting' ? 'Bağlanıyor' : status === 'stopping' ? 'Durduruluyor' : 'Çevrimdışı';
  $('status-text').textContent = statusText;
  $('status-indicator').className = 'status-indicator' + (status === 'online' ? ' online' : status === 'offline' && data.lastError ? ' error' : '');
  $('server-label').textContent = data.host ? data.host + ':' + data.port + (data.username ? ' · ' + data.username : '') : 'Sunucu ayarlanmamış';
  $('error-text').textContent = data.lastError || (data.reconnectInMs ? 'Yeniden bağlanılıyor…' : '');
  $('start-button').disabled = status === 'online' || status === 'connecting' || status === 'stopping';
  $('stop-button').disabled = status === 'offline';
  $('secret-status').textContent = data.loginSecretConfigured ? 'ekli' : 'eklenmedi';
  if (!settingsLoaded && data.config) {
    fillSettings(data.config);
    settingsLoaded = true;
  }
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    render(await request('/api/state'));
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    refreshing = false;
  }
}

async function post(path, body) {
  try {
    const data = await request(path, { method: 'POST', body: JSON.stringify(body || {}) });
    if (data) render(data);
    showNotice('Tamamlandı.', false);
    await refresh();
  } catch (error) {
    showNotice(error.message, true);
  }
}

settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const config = {
    host: $('host').value,
    port: Number($('port').value),
    version: $('version').value,
    username: $('username').value,
    authMode: $('authMode').value,
    autoReconnect: $('autoReconnect').checked,
    autoLogin: $('autoLogin').checked,
    loginCommand: $('loginCommand').value,
    autoMessage: $('autoMessage').checked,
    autoMessageText: $('autoMessageText').value,
    autoMessageIntervalSeconds: Number($('autoMessageIntervalSeconds').value),
    tradeCommand: $('tradeCommand').value
  };
  try {
    await request('/api/config', { method: 'POST', body: JSON.stringify(config) });
    showNotice('Ayarlar kaydedildi.', false);
    settingsLoaded = false;
    await refresh();
  } catch (error) {
    showNotice(error.message, true);
  }
});

$('start-button').addEventListener('click', () => post('/api/bot/start'));
$('stop-button').addEventListener('click', () => post('/api/bot/stop'));
$('trade-button').addEventListener('click', () => post('/api/trade'));
$('chat-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = $('chat-message').value.trim();
  if (!message) return showNotice('Önce bir mesaj yaz.', true);
  await post('/api/chat', { message });
  $('chat-message').value = '';
});

refresh();
window.setInterval(refresh, 2500);
