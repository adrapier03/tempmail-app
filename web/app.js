const inboxSelect = document.getElementById('inboxSelect');
const copyBtn = document.getElementById('copyBtn');
const refreshBtn = document.getElementById('refreshBtn');
const newBtn = document.getElementById('newBtn');
const deleteBtn = document.getElementById('deleteBtn');
const newBox = document.getElementById('newBox');
const createCustomBtn = document.getElementById('createCustomBtn');
const createRandomBtn = document.getElementById('createRandomBtn');
const localPartInput = document.getElementById('localPartInput');
const currentInbox = document.getElementById('currentInbox');
const messageCount = document.getElementById('messageCount');
const messageList = document.getElementById('messageList');
const appTitle = document.getElementById('appTitle');
const appSubtitle = document.getElementById('appSubtitle');

let appConfig = {
  appName: 'Temp Mail',
  mailDomain: 'example.com',
  webHost: 'tempmail.example.com'
};

const SESSION_KEY = 'tempmail_session_id';
let sessionId = localStorage.getItem(SESSION_KEY) || '';

async function fetchJson(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (sessionId) {
    headers['x-session-id'] = sessionId;
  }

  const res = await fetch(url, {
    ...options,
    headers
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadConfig() {
  appConfig = await fetchJson('/api/config', { headers: {} });
  document.title = appConfig.appName;
  appTitle.textContent = appConfig.appName;
  appSubtitle.textContent = `Disposable inbox for ${appConfig.mailDomain}`;
  localPartInput.placeholder = `username atau kosongkan untuk random @${appConfig.mailDomain}`;
}

async function ensureSession() {
  const payload = await fetchJson('/api/session');
  sessionId = payload.sessionId;
  localStorage.setItem(SESSION_KEY, sessionId);
}

async function loadInboxes(selectedAddress) {
  const inboxes = await fetchJson('/api/inboxes');
  inboxSelect.innerHTML = '';

  if (!inboxes.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Belum ada inbox';
    inboxSelect.appendChild(opt);
    currentInbox.textContent = 'No inbox selected';
    messageList.innerHTML = '<div class="message-item">Belum ada inbox. Klik New dulu.</div>';
    messageCount.textContent = '0 messages';
    return;
  }

  inboxes.forEach((inbox) => {
    const opt = document.createElement('option');
    opt.value = inbox.address;
    opt.textContent = inbox.address;
    inboxSelect.appendChild(opt);
  });

  inboxSelect.value = selectedAddress && inboxes.some((x) => x.address === selectedAddress)
    ? selectedAddress
    : inboxes[0].address;

  await loadMessages();
}

async function loadMessages() {
  const address = inboxSelect.value;
  if (!address) return;
  currentInbox.textContent = address;
  const messages = await fetchJson(`/api/inboxes/${encodeURIComponent(address)}/messages`);
  messageCount.textContent = `${messages.length} messages`;

  if (!messages.length) {
    messageList.innerHTML = '<div class="message-item">Inbox kosong.</div>';
    return;
  }

  messageList.innerHTML = messages.map((msg) => `
    <div class="message-item">
      <div class="message-meta">From: ${msg.from} • ${new Date(msg.receivedAt).toLocaleString()}</div>
      <strong>${msg.subject}</strong>
      <p>${msg.body}</p>
    </div>
  `).join('');
}

copyBtn.addEventListener('click', async () => {
  if (!inboxSelect.value) return;
  await navigator.clipboard.writeText(inboxSelect.value);
  copyBtn.textContent = 'Copied';
  setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
});

refreshBtn.addEventListener('click', loadMessages);
newBtn.addEventListener('click', () => newBox.classList.toggle('hidden'));
inboxSelect.addEventListener('change', loadMessages);

deleteBtn.addEventListener('click', async () => {
  if (!inboxSelect.value) return;
  if (!confirm(`Delete inbox ${inboxSelect.value}?`)) return;
  const target = inboxSelect.value;
  await fetchJson(`/api/inboxes/${encodeURIComponent(target)}`, { method: 'DELETE' });
  await loadInboxes();
});

createCustomBtn.addEventListener('click', async () => {
  const localPart = localPartInput.value.trim();
  const inbox = await fetchJson('/api/inboxes', {
    method: 'POST',
    body: JSON.stringify({ localPart })
  });
  localPartInput.value = '';
  await loadInboxes(inbox.address);
});

createRandomBtn.addEventListener('click', async () => {
  const inbox = await fetchJson('/api/inboxes', {
    method: 'POST',
    body: JSON.stringify({})
  });
  localPartInput.value = '';
  await loadInboxes(inbox.address);
});

Promise.all([loadConfig(), ensureSession()]).then(() => loadInboxes()).catch((err) => {
  console.error(err);
  messageList.innerHTML = `<div class="message-item">Gagal init app: ${err.message}</div>`;
});
