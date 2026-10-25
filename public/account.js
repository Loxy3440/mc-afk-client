const $ = (id) => document.getElementById(id);
const accountId = decodeURIComponent(location.pathname.split('/').pop());
let startedAutomatically = false;
let viewerLoaded = false;

async function request(url, options) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options && options.headers ? options.headers : {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'İstek tamamlanamadı.');
  return data;
}

function showNotice(text, isError) {
  const notice = $('notice');
  notice.textContent = text || '';
  notice.classList.toggle('error', Boolean(isError));
}

function render(state) {
  $('account-name').textContent = state.account.name;
  $('account-subtitle').textContent = state.account.username + ' · ' + state.account.host + ':' + state.account.port;
  const online = state.status === 'online';
  $('status-text').textContent = online ? 'Çevrimiçi' : state.status === 'connecting' ? 'Bağlanıyor' : state.status === 'stopping' ? 'Durduruluyor' : 'Çevrimdışı';
  $('status-indicator').className = 'status-indicator' + (online ? ' online' : state.lastError ? ' error' : '');
  $('error-text').textContent = state.lastError || '';
  $('start-button').disabled = online || state.status === 'connecting' || state.status === 'stopping';
  $('stop-button').disabled = state.status === 'offline';
  $('trade-button').disabled = !online || !state.account.tradeCommand;
  $('viewer-chip').textContent = state.viewerReady ? 'Canlı görüntü' : 'Bağlantı bekleniyor';
  $('viewer-wait').classList.toggle('hidden', state.viewerReady);
  $('viewer-frame').classList.toggle('hidden', !state.viewerReady);
  if (state.viewerReady && !viewerLoaded) {
    $('viewer-frame').src = '/view/' + encodeURIComponent(accountId) + '/';
    viewerLoaded = true;
  }
  if (!state.viewerReady && viewerLoaded) {
    $('viewer-frame').removeAttribute('src');
    viewerLoaded = false;
  }
  if (state.viewerReady && !viewerLoaded) {
    $('viewer-frame').src = '/view/' + encodeURIComponent(accountId) + '/';
    viewerLoaded = true;
  }
}

async function refresh() {
  try {
    const state = await request('/api/accounts/' + encodeURIComponent(accountId) + '/state');
    render(state);
    if (state.status === 'offline' && !startedAutomatically) {
      startedAutomatically = true;
      await request('/api/accounts/' + encodeURIComponent(accountId) + '/start', { method: 'POST', body: '{}' });
      showNotice('Hesap oturumu başlatılıyor.', false);
    }
  } catch (error) { showNotice(error.message, true); }
}

$('start-button').addEventListener('click', async () => {
  try { render(await request('/api/accounts/' + encodeURIComponent(accountId) + '/start', { method: 'POST', body: '{}' })); showNotice('Bağlantı başlatıldı.', false); }
  catch (error) { showNotice(error.message, true); }
});
$('stop-button').addEventListener('click', async () => {
  try { render(await request('/api/accounts/' + encodeURIComponent(accountId) + '/stop', { method: 'POST', body: '{}' })); viewerLoaded = false; $('viewer-frame').removeAttribute('src'); showNotice('Oturum durduruldu.', false); }
  catch (error) { showNotice(error.message, true); }
});
$('trade-button').addEventListener('click', async () => {
  try { await request('/api/accounts/' + encodeURIComponent(accountId) + '/trade', { method: 'POST', body: '{}' }); showNotice('Trade komutu gönderildi.', false); }
  catch (error) { showNotice(error.message, true); }
});
$('chat-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = $('chat-message');
  try { await request('/api/accounts/' + encodeURIComponent(accountId) + '/chat', { method: 'POST', body: JSON.stringify({ message: input.value }) }); input.value = ''; showNotice('Mesaj gönderildi.', false); }
  catch (error) { showNotice(error.message, true); }
});

refresh();
window.setInterval(refresh, 2000);
