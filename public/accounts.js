const $ = (id) => document.getElementById(id);
let editingId = null;

async function request(url, options) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options && options.headers ? options.headers : {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'İstek tamamlanamadı.');
  return data;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function showFormNotice(text, error) {
  const box = $('form-notice');
  box.textContent = text || '';
  box.classList.toggle('error', Boolean(error));
}

function fillForm(account) {
  $('name').value = account.name || '';
  $('username').value = account.username || '';
  $('host').value = account.host || '';
  $('port').value = account.port || 25565;
  $('version').value = account.version || '';
  $('authMode').value = account.authMode || 'microsoft';
  $('autoLogin').checked = Boolean(account.autoLogin);
  $('serverLoginPassword').value = '';
  $('password-help').textContent = account.serverLoginPasswordConfigured ? 'Kaydedilmiş parola korunur; değiştirmek için yeni değer yaz.' : 'Parola yok; otomatik giriş için sunucu /login parolasını gir.';
  $('loginCommand').value = account.loginCommand || '/login {password}';
  $('autoMessage').checked = Boolean(account.autoMessage);
  $('autoMessageText').value = account.autoMessageText || '';
  $('autoMessageIntervalSeconds').value = account.autoMessageIntervalSeconds || 300;
  $('tradeCommand').value = account.tradeCommand || '';
  $('autoReconnect').checked = Boolean(account.autoReconnect);
}

function resetForm() {
  editingId = null;
  $('account-form').reset();
  $('port').value = 25565;
  $('loginCommand').value = '/login {password}';
  $('autoMessageIntervalSeconds').value = 300;
  $('autoReconnect').checked = true;
  $('form-title').textContent = 'Hesap ekle';
  $('save-button').textContent = 'Hesap ekle';
  $('cancel-edit').classList.add('hidden');
  $('password-help').textContent = 'Hesap şifreleme anahtarı Secrets içinde olmalı. Parola tekrar gösterilmez.';
}

function accountCard(account) {
  const status = account.status || 'offline';
  const dotClass = status === 'online' ? 'online' : status === 'connecting' ? 'connecting' : '';
  return '<article class="account-card">' +
    '<div class="account-card-head"><span class="account-avatar">' + escapeHtml(account.name.slice(0, 1).toUpperCase()) + '</span><div class="account-card-title"><h3>' + escapeHtml(account.name) + '</h3><p>' + escapeHtml(account.username) + '</p></div><span class="mini-status ' + dotClass + '">' + (status === 'online' ? 'Çevrimiçi' : status === 'connecting' ? 'Bağlanıyor' : 'Çevrimdışı') + '</span></div>' +
    '<div class="account-host">' + escapeHtml(account.host) + ':' + escapeHtml(account.port) + '</div>' +
    '<div class="account-card-actions"><a class="button button-primary" href="/account/' + encodeURIComponent(account.id) + '">Hesabın görüntüsünü aç</a><button class="button button-secondary edit-button" data-id="' + escapeHtml(account.id) + '" type="button">Düzenle</button><button class="button button-danger delete-button" data-id="' + escapeHtml(account.id) + '" type="button">Sil</button></div>' +
    '</article>';
}

async function loadAccounts() {
  try {
    const data = await request('/api/accounts');
    $('session-limit').textContent = 'En fazla ' + data.maxActiveBots + ' aktif';
    const list = $('accounts-list');
    if (!data.accounts.length) {
      list.innerHTML = '<div class="empty-state"><strong>Henüz hesap eklenmemiş.</strong><span>Sağdaki formdan ilk hesabı oluştur.</span></div>';
      return;
    }
    const states = await Promise.all(data.accounts.map(async (account) => {
      try { const state = await request('/api/accounts/' + encodeURIComponent(account.id) + '/state'); return { ...account, status: state.status }; }
      catch { return { ...account, status: 'offline' }; }
    }));
    list.innerHTML = states.map(accountCard).join('');
    list.querySelectorAll('.edit-button').forEach((button) => button.addEventListener('click', () => editAccount(button.dataset.id)));
    list.querySelectorAll('.delete-button').forEach((button) => button.addEventListener('click', () => deleteAccount(button.dataset.id)));
  } catch (error) {
    $('accounts-list').innerHTML = '<div class="empty-state error">' + escapeHtml(error.message) + '</div>';
  }
}

async function editAccount(id) {
  try {
    const data = await request('/api/accounts/' + encodeURIComponent(id));
    editingId = id;
    fillForm(data.account);
    $('form-title').textContent = 'Hesabı düzenle';
    $('save-button').textContent = 'Değişiklikleri kaydet';
    $('cancel-edit').classList.remove('hidden');
    showFormNotice('Parola alanını boş bırakırsan kayıtlı sunucu parolası değişmeden kalır.', false);
    $('name').focus();
  } catch (error) { showFormNotice(error.message, true); }
}

async function deleteAccount(id) {
  if (!window.confirm('Bu hesabı silmek istiyor musun?')) return;
  try {
    await request('/api/accounts/' + encodeURIComponent(id), { method: 'DELETE' });
    showFormNotice('Hesap silindi.', false);
    await loadAccounts();
  } catch (error) { showFormNotice(error.message, true); }
}

$('account-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = {
    name: $('name').value,
    username: $('username').value,
    host: $('host').value,
    port: Number($('port').value),
    version: $('version').value,
    authMode: $('authMode').value,
    autoLogin: $('autoLogin').checked,
    serverLoginPassword: $('serverLoginPassword').value,
    loginCommand: $('loginCommand').value,
    autoMessage: $('autoMessage').checked,
    autoMessageText: $('autoMessageText').value,
    autoMessageIntervalSeconds: Number($('autoMessageIntervalSeconds').value),
    tradeCommand: $('tradeCommand').value,
    autoReconnect: $('autoReconnect').checked
  };
  try {
    if (editingId) await request('/api/accounts/' + encodeURIComponent(editingId), { method: 'PATCH', body: JSON.stringify(data) });
    else await request('/api/accounts', { method: 'POST', body: JSON.stringify(data) });
    showFormNotice(editingId ? 'Hesap güncellendi.' : 'Hesap eklendi.', false);
    resetForm();
    await loadAccounts();
  } catch (error) { showFormNotice(error.message, true); }
});

$('cancel-edit').addEventListener('click', resetForm);
resetForm();
loadAccounts();
window.setInterval(loadAccounts, 5000);
