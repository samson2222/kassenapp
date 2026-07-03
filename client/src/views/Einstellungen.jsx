import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store';
import { api } from '../api';

function uid() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

function fmt(n) {
  return (Math.round(n * 100) / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function soll(transactions) {
  return transactions.filter(t => !t.voided).reduce((s, t) => s + t.total, 0);
}

// Simple debounce
function useDebounce(fn, ms) {
  const timer = useCallback(
    (() => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; })(),
    [fn]
  );
  return timer;
}

export default function Einstellungen() {
  const { event, resetEvent, archiveEvent, updateConfig } = useStore();
  const cfg = event?.config || {};

  // Local editable copies
  const [eventName, setEventName] = useState(cfg.eventName || event?.name || '');
  const [count, setCount] = useState(cfg.bedienungenCount || 4);
  const [names, setNames] = useState(cfg.bedienungenNames || []);
  const [products, setProducts] = useState(cfg.products || []);

  // Sync when server config changes (e.g. after first SSE load)
  useEffect(() => {
    setEventName(cfg.eventName || event?.name || '');
    setCount(cfg.bedienungenCount || 4);
    setNames(cfg.bedienungenNames || []);
    setProducts(cfg.products || []);
  }, [event?.id]);

  // Event history
  const [history, setHistory] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    api.get('/api/events').then(setHistory).catch(() => {});
  }, []);

  async function loadArchivedEvent(id) {
    const data = await api.get(`/api/events/${id}`);
    setSelectedEvent(data);
  }

  // Save config (debounced 600ms)
  const debouncedSave = useCallback(
    (() => {
      let t;
      return (patch) => {
        clearTimeout(t);
        t = setTimeout(() => updateConfig(patch), 600);
      };
    })(),
    []
  );

  function updateAndSave(patch) {
    const next = {
      eventName,
      bedienungenCount: count,
      bedienungenNames: names,
      products,
      ...patch,
    };
    debouncedSave(next);
    return next;
  }

  function setNameAt(i, val) {
    const n = [...names];
    n[i] = val;
    setNames(n);
    updateAndSave({ bedienungenNames: n });
  }

  function setProductField(i, field, val) {
    const p = products.map((pp, idx) => idx === i ? { ...pp, [field]: field === 'price' ? (Number(val) || 0) : val } : pp);
    setProducts(p);
    updateAndSave({ products: p });
  }

  function addProduct() {
    const p = [...products, { id: uid(), name: 'Neues Produkt', price: 0, category: 'Sonstiges' }];
    setProducts(p);
    updateAndSave({ products: p });
  }

  function removeProduct(i) {
    const p = products.filter((_, idx) => idx !== i);
    setProducts(p);
    updateAndSave({ products: p });
  }

  function changeCount(delta) {
    const c = Math.max(1, Math.min(6, count + delta));
    setCount(c);
    updateAndSave({ bedienungenCount: c });
  }

  async function handleReset() {
    if (confirm('Wirklich alle Verkäufe und Abrechnungen des aktuellen Fests löschen?\nDie Konfiguration bleibt erhalten. Kann nicht rückgängig gemacht werden.')) {
      await resetEvent();
    }
  }

  async function handleArchive() {
    const newName = prompt('Name der neuen Veranstaltung:', event?.name || 'Vereinsfest');
    if (newName === null) return;
    await archiveEvent(newName);
    const h = await api.get('/api/events');
    setHistory(h);
  }

  return (
    <section id="view-einstellungen">
      <div className="section-title">Veranstaltung</div>
      <div className="field-row">
        <label>Name der Veranstaltung</label>
        <input
          type="text"
          value={eventName}
          onChange={e => { setEventName(e.target.value); updateAndSave({ eventName: e.target.value }); }}
        />
      </div>

      <div className="section-title">Bedienungen (1–6)</div>
      <div className="stepper">
        <button onClick={() => changeCount(-1)}>−</button>
        <span className="num">{count}</span>
        <button onClick={() => changeCount(1)}>+</button>
      </div>
      <div className="name-inputs">
        {Array.from({ length: count }, (_, i) => (
          <input
            key={i}
            type="text"
            value={names[i] || ''}
            placeholder={`Name Bedienung ${i + 1}`}
            onChange={e => setNameAt(i, e.target.value)}
          />
        ))}
      </div>

      <div className="section-title">Produkte</div>
      <div id="prod-list">
        {products.map((p, i) => (
          <div key={p.id} className="prod-row">
            <input
              type="text"
              value={p.name}
              placeholder="Produktname"
              onChange={e => setProductField(i, 'name', e.target.value)}
            />
            <input
              type="number"
              step="0.10"
              value={p.price}
              placeholder="Preis"
              onChange={e => setProductField(i, 'price', e.target.value)}
            />
            <input
              type="text"
              value={p.category}
              placeholder="Kategorie"
              onChange={e => setProductField(i, 'category', e.target.value)}
            />
            <button className="icon-btn" onClick={() => removeProduct(i)}>✕</button>
          </div>
        ))}
      </div>
      <button className="btn btn-full" onClick={addProduct} style={{ marginTop: '8px' }}>
        Produkt hinzufügen
      </button>

      {/* ── Event history ── */}
      <div className="section-title" style={{ marginTop: '28px' }}>
        Vergangene Veranstaltungen
        <button
          className="btn btn-ghost"
          style={{ float: 'right', padding: '4px 10px', fontSize: '12px' }}
          onClick={() => setShowHistory(v => !v)}
        >
          {showHistory ? 'Ausblenden' : 'Anzeigen'}
        </button>
      </div>
      {showHistory && (
        <div>
          {history.filter(e => e.archived_at).length === 0 && (
            <div className="empty-hint">Noch keine archivierten Veranstaltungen.</div>
          )}
          {history.filter(e => e.archived_at).map(e => (
            <div key={e.id} className="history-row" onClick={() => loadArchivedEvent(e.id)}>
              <div>
                <div style={{ fontWeight: 600 }}>{e.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{fmtDate(e.created_at)}</div>
              </div>
              <span style={{ color: 'var(--gold)', fontSize: '12px' }}>Details →</span>
            </div>
          ))}
        </div>
      )}

      {selectedEvent && (
        <div className="history-detail">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <strong>{selectedEvent.event.name}</strong>
            <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => setSelectedEvent(null)}>
              Schließen
            </button>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            Gesamtumsatz: {fmt(soll(selectedEvent.transactions))}
          </div>
          {(selectedEvent.event.config.bedienungenNames || []).slice(0, selectedEvent.event.config.bedienungenCount).map((n, i) => {
            const s = selectedEvent.transactions.filter(t => t.bedienungIndex === i && !t.voided).reduce((a, t) => a + t.total, 0);
            const settlement = selectedEvent.settlements[i] || {};
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                <span>{n}</span>
                <span>Soll {fmt(s)} | Ist {settlement.ist != null ? fmt(settlement.ist) : '–'}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Danger zone ── */}
      <div className="danger-zone">
        <h3 style={{ margin: 0, fontSize: '14px', color: 'var(--red)' }}>Veranstaltungsaktionen</h3>
        <p>
          <strong>Archivieren & Neu starten:</strong> Aktuelle Veranstaltung wird mit allen Daten archiviert.
          Eine neue Veranstaltung wird angelegt (Konfiguration bleibt erhalten).
        </p>
        <button className="btn btn-danger-outline btn-full" onClick={handleArchive}>
          Archivieren &amp; neue Veranstaltung starten
        </button>
        <p style={{ marginTop: '14px' }}>
          <strong>Nur Verkäufe zurücksetzen:</strong> Löscht Verkäufe und Abrechnungen des aktuellen Fests unwiderruflich.
          Konfiguration bleibt erhalten. Für Tests oder Korrekturen.
        </p>
        <button className="btn btn-danger-outline btn-full" onClick={handleReset}>
          Nur Verkäufe &amp; Abrechnungen zurücksetzen
        </button>
      </div>
    </section>
  );
}
