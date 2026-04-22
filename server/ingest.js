import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { simpleParser } from 'mailparser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.resolve(__dirname, '../storage/data.json');

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

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks)));
    process.stdin.on('error', reject);
  });
}

function pickRecipient(parsed) {
  const candidates = [];
  if (parsed.to?.value?.length) candidates.push(...parsed.to.value);
  if (parsed.deliveredTo) candidates.push({ address: parsed.deliveredTo });
  if (parsed.headers?.get('x-original-to')) candidates.push({ address: parsed.headers.get('x-original-to') });
  return candidates.find((x) => x?.address)?.address?.toLowerCase() || null;
}

(async () => {
  try {
    const raw = await readStdin();
    const parsed = await simpleParser(raw);
    const originalRecipient = process.argv[2]?.toLowerCase() || null;
    const to = originalRecipient || pickRecipient(parsed);
    if (!to) throw new Error('No recipient found in message');

    const from = parsed.from?.text || 'unknown@unknown';
    const subject = parsed.subject || '(no subject)';
    const body = parsed.text?.trim() || parsed.html || '';

    const data = loadData();
    if (!Array.isArray(data.inboxes)) data.inboxes = [];
    if (!Array.isArray(data.messages)) data.messages = [];
    if (!Array.isArray(data.sessions)) data.sessions = [];
    if (!data.inboxes.some((x) => x.address === to)) {
      data.inboxes.unshift({ address: to, createdAt: new Date().toISOString() });
    }

    data.messages.unshift({
      id: `msg_${Date.now()}`,
      to,
      from,
      subject,
      body,
      receivedAt: new Date().toISOString()
    });

    saveData(data);
    process.stdout.write(`Stored message for ${to}\n`);
  } catch (error) {
    console.error(error.stack || String(error));
    process.exit(1);
  }
})();
