import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.resolve(__dirname, '../storage/data.json');
const WEB_PATH = path.resolve(__dirname, '../web');

const app = express();
const PORT = process.env.PORT || 3001;
const APP_NAME = process.env.APP_NAME || 'Temp Mail';
const MAIL_DOMAIN = process.env.MAIL_DOMAIN || 'example.com';
const WEB_HOST = process.env.WEB_HOST || `tempmail.${MAIL_DOMAIN}`;

app.use(cors());
app.use(express.json());
app.use(express.static(WEB_PATH));

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch {
    return { inboxes: [], messages: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomLocalPart() {
  const first = [
    'langit', 'senja', 'pagi', 'malam', 'kopi', 'hujan', 'bulan', 'bintang', 'angin', 'awan',
    'nusa', 'rasa', 'jalan', 'teman', 'cerita', 'warna', 'nadi', 'cahya', 'putra', 'putri',
    'bagas', 'adit', 'arya', 'dimas', 'fajar', 'rizky', 'galih', 'bayu', 'bima', 'nanda'
  ];
  const second = [
    'biru', 'pagi', 'malam', 'manis', 'tenang', 'laut', 'hutan', 'cerah', 'jingga', 'ungu',
    'indah', 'muda', 'asri', 'utama', 'jaya', 'kecil', 'besar', 'lucu', 'syahdu', 'harum',
    'aji', 'wira', 'ayu', 'sari', 'utama', 'rama', 'nugraha', 'permata', 'lestari', 'mahesa'
  ];
  const useNumber = Math.random() < 0.8;
  const suffix = useNumber ? String(Math.floor(Math.random() * 90) + 10) : '';
  return `${pick(first)}${pick(second)}${suffix}`;
}

function generateUniqueAddress(data, domain) {
  for (let i = 0; i < 50; i++) {
    const address = `${randomLocalPart()}@${domain}`;
    if (!data.inboxes.find((x) => x.address === address)) {
      return address;
    }
  }

  const fallback = `${randomLocalPart()}${Date.now().toString().slice(-4)}@${domain}`;
  if (!data.inboxes.find((x) => x.address === fallback)) {
    return fallback;
  }

  throw new Error('Failed to generate unique inbox address');
}

function ensureShape(data) {
  if (!Array.isArray(data.inboxes)) data.inboxes = [];
  if (!Array.isArray(data.messages)) data.messages = [];
  if (!Array.isArray(data.sessions)) data.sessions = [];
  return data;
}

function getSessionId(req) {
  const header = req.get('x-session-id')?.trim();
  return header || null;
}

function ensureSession(data, sessionId) {
  let session = data.sessions.find((x) => x.id === sessionId);
  if (!session) {
    session = { id: sessionId, inboxes: [], createdAt: new Date().toISOString() };
    data.sessions.unshift(session);
  }
  if (!Array.isArray(session.inboxes)) session.inboxes = [];
  return session;
}

app.get('/api/config', (req, res) => {
  res.json({
    appName: APP_NAME,
    mailDomain: MAIL_DOMAIN,
    webHost: WEB_HOST
  });
});

app.get('/api/session', (req, res) => {
  let sessionId = getSessionId(req);
  if (!sessionId) sessionId = crypto.randomUUID();
  const data = ensureShape(loadData());
  ensureSession(data, sessionId);
  saveData(data);
  res.json({ sessionId });
});

app.get('/api/inboxes', (req, res) => {
  const sessionId = getSessionId(req);
  if (!sessionId) return res.status(400).json({ error: 'Missing x-session-id' });
  const data = ensureShape(loadData());
  const session = ensureSession(data, sessionId);
  const inboxes = session.inboxes
    .map((address) => data.inboxes.find((x) => x.address === address) || { address, createdAt: null })
    .filter(Boolean);
  saveData(data);
  res.json(inboxes);
});

app.post('/api/inboxes', (req, res) => {
  const sessionId = getSessionId(req);
  if (!sessionId) return res.status(400).json({ error: 'Missing x-session-id' });

  const data = ensureShape(loadData());
  const session = ensureSession(data, sessionId);
  const domain = req.body.domain || MAIL_DOMAIN;
  const requested = (req.body.localPart || '').trim().toLowerCase();
  const address = requested ? `${requested}@${domain}` : generateUniqueAddress(data, domain);

  let inbox = data.inboxes.find((x) => x.address === address);

  if (!inbox) {
    inbox = {
      address,
      createdAt: new Date().toISOString()
    };
    data.inboxes.unshift(inbox);
  }

  if (!session.inboxes.includes(address)) {
    session.inboxes.unshift(address);
  }

  saveData(data);
  res.status(201).json(inbox);
});

app.delete('/api/inboxes/:address', (req, res) => {
  const sessionId = getSessionId(req);
  if (!sessionId) return res.status(400).json({ error: 'Missing x-session-id' });

  const data = ensureShape(loadData());
  const session = ensureSession(data, sessionId);
  const address = decodeURIComponent(req.params.address);
  session.inboxes = session.inboxes.filter((x) => x !== address);
  saveData(data);
  res.json({ ok: true });
});

app.get('/api/inboxes/:address/messages', (req, res) => {
  const sessionId = getSessionId(req);
  if (!sessionId) return res.status(400).json({ error: 'Missing x-session-id' });

  const data = ensureShape(loadData());
  const session = ensureSession(data, sessionId);
  const address = decodeURIComponent(req.params.address);

  if (!session.inboxes.includes(address)) {
    return res.status(403).json({ error: 'Inbox not in this session' });
  }

  const messages = data.messages
    .filter((x) => x.to === address)
    .sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
  saveData(data);
  res.json(messages);
});

app.post('/api/dev/messages', (req, res) => {
  const data = ensureShape(loadData());
  const { to, from, subject, body } = req.body;

  if (!to) {
    return res.status(400).json({ error: 'Missing to' });
  }

  const inboxExists = data.inboxes.some((x) => x.address === to);
  if (!inboxExists) {
    data.inboxes.unshift({ address: to, createdAt: new Date().toISOString() });
  }

  const message = {
    id: `msg_${Date.now()}`,
    to,
    from: from || 'demo@example.com',
    subject: subject || 'Test message',
    body: body || 'Hello from tempmail scaffold',
    receivedAt: new Date().toISOString()
  };

  data.messages.unshift(message);
  saveData(data);
  res.status(201).json(message);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(WEB_PATH, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Temp mail app listening on http://localhost:${PORT}`);
});
