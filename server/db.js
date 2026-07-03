// node:sqlite is built-in since Node 22.12 / Node 24 – no native compilation needed
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'kassenapp.sqlite')
  : path.join(__dirname, 'kassenapp.sqlite');

const db = new DatabaseSync(DB_PATH);

// Better concurrent-write performance
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
// Schema migration: add startgeld column if not present
try { db.exec('ALTER TABLE settlements ADD COLUMN startgeld REAL'); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL DEFAULT 'Vereinsfest',
    created_at  INTEGER NOT NULL,
    archived_at INTEGER,
    config      TEXT    NOT NULL
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id               TEXT    PRIMARY KEY,
    event_id         INTEGER NOT NULL REFERENCES events(id),
    bedienung_index  INTEGER NOT NULL,
    items            TEXT    NOT NULL,
    total            REAL    NOT NULL,
    ts               INTEGER NOT NULL,
    voided           INTEGER NOT NULL DEFAULT 0,
    voided_at        INTEGER
  );
  CREATE TABLE IF NOT EXISTS settlements (
    event_id         INTEGER NOT NULL REFERENCES events(id),
    bedienung_index  INTEGER NOT NULL,
    ist              REAL,
    closed           INTEGER NOT NULL DEFAULT 0,
    closed_at        INTEGER,
    PRIMARY KEY (event_id, bedienung_index)
  );
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const DEFAULT_CONFIG = {
  bedienungenCount: 4,
  bedienungenNames: ['Bedienung 1','Bedienung 2','Bedienung 3','Bedienung 4','Bedienung 5','Bedienung 6'],
  products: [
    {id:'p1',name:'Bier 0,5l',   price:4.00,category:'Getränke'},
    {id:'p2',name:'Radler 0,5l', price:4.00,category:'Getränke'},
    {id:'p3',name:'Wasser 0,33l',price:2.50,category:'Getränke'},
    {id:'p4',name:'Cola / Fanta',price:3.00,category:'Getränke'},
    {id:'p5',name:'Wein 0,2l',   price:4.50,category:'Getränke'},
    {id:'p6',name:'Bratwurst im Brötchen',price:4.50,category:'Speisen'},
    {id:'p7',name:'Steak im Brötchen',   price:6.00,category:'Speisen'},
    {id:'p8',name:'Pommes',       price:3.50,category:'Speisen'},
    {id:'p9',name:'Kuchen',       price:2.50,category:'Sonstiges'},
  ]
};

// ── Bootstrap ─────────────────────────────────────────────────────────────────

function initAdminPassword() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_password_hash');
  if (!row) {
    const pw = process.env.ADMIN_PASSWORD || 'admin';
    const hash = bcrypt.hashSync(pw, 10);
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('admin_password_hash', hash);
    if (!process.env.ADMIN_PASSWORD) {
      console.warn('[WARN] Kein ADMIN_PASSWORD gesetzt. Standard-Passwort: "admin"');
    }
  }
}

function initActiveEvent() {
  const active = db.prepare('SELECT id FROM events WHERE archived_at IS NULL ORDER BY id DESC LIMIT 1').get();
  if (!active) {
    db.prepare('INSERT INTO events (name, created_at, config) VALUES (?, ?, ?)').run(
      'Vereinsfest', Date.now(), JSON.stringify(DEFAULT_CONFIG)
    );
  }
}

initAdminPassword();
initActiveEvent();

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseEvent(ev) {
  if (ev) ev.config = JSON.parse(ev.config);
  return ev;
}
function parseTx(t) {
  return {
    id:              t.id,
    eventId:         t.event_id,
    bedienungIndex:  t.bedienung_index,
    items:           JSON.parse(t.items),
    total:           t.total,
    ts:              t.ts,
    voided:          t.voided === 1,
  };
}
function parseSettlements(rows) {
  const result = {};
  for (const r of rows) {
    result[r.bedienung_index] = { ist: r.ist, startgeld: r.startgeld, closed: r.closed === 1, closedAt: r.closed_at };
  }
  return result;
}

// ── Queries ───────────────────────────────────────────────────────────────────

function getActiveEvent() {
  return parseEvent(
    db.prepare('SELECT * FROM events WHERE archived_at IS NULL ORDER BY id DESC LIMIT 1').get()
  );
}

function getTransactions(eventId) {
  return db.prepare('SELECT * FROM transactions WHERE event_id = ? ORDER BY ts ASC').all(eventId).map(parseTx);
}

function getSettlements(eventId) {
  return parseSettlements(
    db.prepare('SELECT * FROM settlements WHERE event_id = ?').all(eventId)
  );
}

function getFullState() {
  const event = getActiveEvent();
  return { event, transactions: getTransactions(event.id), settlements: getSettlements(event.id) };
}

function addTransaction({ id, bedienungIndex, items, total, ts }) {
  const ev = getActiveEvent();
  db.prepare(`
    INSERT INTO transactions (id, event_id, bedienung_index, items, total, ts, voided)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(id, ev.id, bedienungIndex, JSON.stringify(items), total, ts || Date.now());
}

function voidTransaction(id) {
  db.prepare('UPDATE transactions SET voided = 1, voided_at = ? WHERE id = ?').run(Date.now(), id);
}

function saveSettlement(eventId, bedienungIndex, updates) {
  const existing = db.prepare(
    'SELECT * FROM settlements WHERE event_id = ? AND bedienung_index = ?'
  ).get(eventId, bedienungIndex);

  const ist       = updates.ist       !== undefined ? updates.ist       : (existing?.ist       ?? null);
  const startgeld = updates.startgeld !== undefined ? updates.startgeld : (existing?.startgeld ?? null);
  const closed    = updates.closed    !== undefined ? !!updates.closed  : !!(existing?.closed);
  const closedAt  = closed ? (existing?.closed_at || Date.now()) : null;

  db.prepare(`
    INSERT INTO settlements (event_id, bedienung_index, ist, startgeld, closed, closed_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (event_id, bedienung_index) DO UPDATE SET
      ist       = excluded.ist,
      startgeld = excluded.startgeld,
      closed    = excluded.closed,
      closed_at = excluded.closed_at
  `).run(eventId, bedienungIndex, ist, startgeld, closed ? 1 : 0, closedAt);
}

function updateConfig(config) {
  const ev = getActiveEvent();
  db.prepare('UPDATE events SET config = ?, name = ? WHERE id = ?')
    .run(JSON.stringify(config), config.eventName || ev.name, ev.id);
}

function resetCurrentEvent() {
  const ev = getActiveEvent();
  db.prepare('DELETE FROM transactions WHERE event_id = ?').run(ev.id);
  db.prepare('DELETE FROM settlements WHERE event_id = ?').run(ev.id);
}

function archiveAndCreateNew(newName) {
  const ev = getActiveEvent();
  db.prepare('UPDATE events SET archived_at = ? WHERE id = ?').run(Date.now(), ev.id);
  const cfg = { ...ev.config, eventName: newName || ev.name };
  db.prepare('INSERT INTO events (name, created_at, config) VALUES (?, ?, ?)')
    .run(newName || ev.name, Date.now(), JSON.stringify(cfg));
}

function getAllEvents() {
  return db.prepare('SELECT id, name, created_at, archived_at FROM events ORDER BY id DESC').all();
}

function getArchivedEvent(id) {
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!ev) return null;
  ev.config = JSON.parse(ev.config);
  return { event: ev, transactions: getTransactions(ev.id), settlements: getSettlements(ev.id) };
}

function verifyPassword(password) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_password_hash');
  return row ? bcrypt.compareSync(password, row.value) : false;
}

module.exports = {
  getActiveEvent, getFullState,
  addTransaction, voidTransaction,
  saveSettlement, updateConfig,
  resetCurrentEvent, archiveAndCreateNew,
  getAllEvents, getArchivedEvent,
  verifyPassword,
};
