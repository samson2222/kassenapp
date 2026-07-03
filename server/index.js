const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
app.use(express.json());

// Static frontend (Vite build)
app.use(express.static(path.join(__dirname, '../client/dist')));

// ── SSE ──────────────────────────────────────────────────────────────────────
const sseClients = new Set();

function broadcast(state) {
  const payload = `data: ${JSON.stringify({ type: 'state', data: state })}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); }
    catch { sseClients.delete(res); }
  }
}

// Keep-alive ping every 25 s (prevents proxy timeouts)
setInterval(() => {
  for (const res of sseClients) {
    try { res.write(': ping\n\n'); }
    catch { sseClients.delete(res); }
  }
}, 25_000);

app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  // Send full state immediately on connect
  const state = db.getFullState();
  res.write(`data: ${JSON.stringify({ type: 'state', data: state })}\n\n`);

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// ── Auth ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/verify', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Passwort fehlt' });
  res.json({ ok: db.verifyPassword(password) });
});

// ── State snapshot ────────────────────────────────────────────────────────────
app.get('/api/state', (req, res) => {
  res.json(db.getFullState());
});

// ── Transactions ──────────────────────────────────────────────────────────────
app.post('/api/transactions', (req, res) => {
  const { id, bedienungIndex, items, total, ts } = req.body;
  if (!id || bedienungIndex == null || !items || total == null) {
    return res.status(400).json({ error: 'Ungültige Daten' });
  }
  try {
    db.addTransaction({ id, bedienungIndex, items, total, ts });
    broadcast(db.getFullState());
    res.json({ ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Bereits gebucht' });
    throw e;
  }
});

app.patch('/api/transactions/:id/void', (req, res) => {
  db.voidTransaction(req.params.id);
  broadcast(db.getFullState());
  res.json({ ok: true });
});

// ── Settlements ───────────────────────────────────────────────────────────────
app.put('/api/settlements/:bIndex', (req, res) => {
  try {
    const event = db.getActiveEvent();
    const saved = db.saveSettlement(event.id, Number(req.params.bIndex), req.body);
    console.log('[settlements PUT] confirmed in DB:', JSON.stringify(saved));
    broadcast(db.getFullState());
    res.json({ ok: true, saved });
  } catch (e) {
    console.error('[settlements PUT] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Config (admin) ────────────────────────────────────────────────────────────
app.put('/api/config', (req, res) => {
  db.updateConfig(req.body);
  broadcast(db.getFullState());
  res.json({ ok: true });
});

app.post('/api/events/reset', (req, res) => {
  db.resetCurrentEvent();
  broadcast(db.getFullState());
  res.json({ ok: true });
});

app.post('/api/events/archive', (req, res) => {
  db.archiveAndCreateNew(req.body?.newName);
  broadcast(db.getFullState());
  res.json({ ok: true });
});

// ── Event history ─────────────────────────────────────────────────────────────
app.get('/api/events', (req, res) => {
  res.json(db.getAllEvents());
});

app.get('/api/events/:id', (req, res) => {
  const data = db.getArchivedEvent(Number(req.params.id));
  if (!data) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json(data);
});

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kassenapp läuft auf Port ${PORT}`));
