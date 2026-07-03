import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { api } from '../api';

export const PRODUCT_COLORS = [
  { id: 'none',   swatch: '#E5E7EB' },
  { id: 'blue',   swatch: '#3B82F6', bg: '#EFF6FF', border: '#3B82F6' },
  { id: 'green',  swatch: '#22C55E', bg: '#F0FDF4', border: '#22C55E' },
  { id: 'amber',  swatch: '#F59E0B', bg: '#FFFBEB', border: '#F59E0B' },
  { id: 'red',    swatch: '#FB7185', bg: '#FFF1F2', border: '#FB7185' },
  { id: 'purple', swatch: '#A855F7', bg: '#FAF5FF', border: '#A855F7' },
  { id: 'teal',   swatch: '#14B8A6', bg: '#F0FDFA', border: '#14B8A6' },
  { id: 'orange', swatch: '#FB923C', bg: '#FFF7ED', border: '#FB923C' },
];

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

export default function Einstellungen() {
  const { event, resetEvent, archiveEvent, updateConfig } = useStore();
  const cfg = event?.config || {};

  const DEFAULT_CATS = ['Getränke', 'Speisen', 'Sonstiges'];

  const [eventName, setEventName]   = useState(cfg.eventName || event?.name || '');
  const [count, setCount]           = useState(cfg.bedienungenCount || 4);
  const [names, setNames]           = useState(cfg.bedienungenNames || []);
  const [provisions, setProvisions] = useState(cfg.bedienungenProvision || []);
  const [products, setProducts]     = useState(cfg.products || []);
  const [saveState, setSaveState]   = useState('idle'); // 'idle' | 'saving' | 'saved'

  // Categories: defaults + any custom ones already used in products
  const [categories, setCategories] = useState(
    () => [...new Set([...DEFAULT_CATS, ...(cfg.products || []).map(p => p.category).filter(Boolean)])]
  );

  function addCategory() {
    const name = prompt('Name der neuen Kategorie:');
    if (!name?.trim()) return;
    setCategories(prev => [...new Set([...prev, name.trim()])]);
  }

  useEffect(() => {
    const p = cfg.products || [];
    setEventName(cfg.eventName || event?.name || '');
    setCount(cfg.bedienungenCount || 4);
    setNames(cfg.bedienungenNames || []);
    setProvisions(cfg.bedienungenProvision || []);
    setProducts(p);
    setCategories(prev => [...new Set([...DEFAULT_CATS, ...prev, ...p.map(pp => pp.category).filter(Boolean)])]);
  }, [event?.id]);

  // Event history
  const [history, setHistory]           = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showHistory, setShowHistory]   = useState(false);

  useEffect(() => {
    api.get('/api/events').then(setHistory).catch(() => {});
  }, []);

  async function loadArchivedEvent(id) {
    const data = await api.get(`/api/events/${id}`);
    setSelectedEvent(data);
  }

  function setProvisionAt(i, val) {
    const p = [...provisions];
    p[i] = val;
    setProvisions(p);
  }

  async function handleSave() {
    setSaveState('saving');
    try {
      await updateConfig({ eventName, bedienungenCount: count, bedienungenNames: names, bedienungenProvision: provisions, products });
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      setSaveState('idle');
    }
  }

  function setNameAt(i, val) {
    const n = [...names];
    n[i] = val;
    setNames(n);
  }

  function setProductField(i, field, val) {
    setProducts(products.map((p, idx) =>
      idx === i ? { ...p, [field]: field === 'price' ? (Number(val) || 0) : val } : p
    ));
  }

  function addProduct() {
    setProducts([...products, { id: uid(), name: 'Neues Produkt', price: 0, category: 'Sonstiges' }]);
  }

  function addSeparator() {
    setProducts([...products, { id: uid(), type: 'separator', name: '' }]);
  }

  function removeProduct(i) {
    setProducts(products.filter((_, idx) => idx !== i));
  }

  function moveProduct(i, dir) {
    const p = [...products];
    const j = i + dir;
    if (j < 0 || j >= p.length) return;
    [p[i], p[j]] = [p[j], p[i]];
    setProducts(p);
  }

  function setProductColor(i, colorId) {
    setProducts(products.map((p, idx) => idx === i ? { ...p, color: colorId } : p));
  }

  function changeCount(delta) {
    setCount(c => Math.max(1, Math.min(6, c + delta)));
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

  const saveLabel = saveState === 'saving' ? 'Wird gespeichert…' : saveState === 'saved' ? '✓ Gespeichert' : 'Einstellungen speichern';

  return (
    <section id="view-einstellungen">

      <div className="section-title">Veranstaltung</div>
      <div className="field-row">
        <label>Name der Veranstaltung</label>
        <input type="text" value={eventName} onChange={e => setEventName(e.target.value)} />
      </div>

      <div className="section-title">Bedienungen (1–6)</div>
      <div className="stepper">
        <button onClick={() => changeCount(-1)}>−</button>
        <span className="num">{count}</span>
        <button onClick={() => changeCount(1)}>+</button>
      </div>
      <div className="name-inputs">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="bedienung-cfg-row">
            <input
              type="text"
              value={names[i] || ''}
              placeholder={`Name Bedienung ${i + 1}`}
              onChange={e => setNameAt(i, e.target.value)}
            />
            <div className="provision-field">
              <span>Provision</span>
              <input
                type="number"
                value={provisions[i] ?? 10}
                min="0"
                max="100"
                step="0.5"
                onChange={e => setProvisionAt(i, Number(e.target.value) || 0)}
              />
              <span>%</span>
            </div>
          </div>
        ))}
      </div>

      <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Produkte</span>
        <button className="btn btn-ghost" style={{ padding: '3px 10px', fontSize: '11px' }} onClick={addCategory}>
          + Kategorie
        </button>
      </div>
      <div id="prod-list">
        {products.map((p, i) => p.type === 'separator' ? (
          <div key={p.id} className="prod-card prod-separator-card">
            <div className="prod-card-row1">
              <div className="prod-order-btns">
                <button onClick={() => moveProduct(i, -1)} disabled={i === 0}>↑</button>
                <button onClick={() => moveProduct(i,  1)} disabled={i === products.length - 1}>↓</button>
              </div>
              <span className="separator-badge">── Trennstrich ──</span>
              <input
                type="text"
                value={p.name || ''}
                placeholder="Beschriftung (optional)"
                onChange={e => setProductField(i, 'name', e.target.value)}
              />
              <button className="icon-btn" onClick={() => removeProduct(i)}>✕</button>
            </div>
          </div>
        ) : (
          <div key={p.id} className="prod-card">
            <div className="prod-card-row1">
              <div className="prod-order-btns">
                <button onClick={() => moveProduct(i, -1)} disabled={i === 0}>↑</button>
                <button onClick={() => moveProduct(i,  1)} disabled={i === products.length - 1}>↓</button>
              </div>
              <input
                type="text"
                value={p.name}
                placeholder="Produktname"
                onChange={e => setProductField(i, 'name', e.target.value)}
              />
              <button className="icon-btn" onClick={() => removeProduct(i)}>✕</button>
            </div>
            <div className="prod-card-row2">
              <div className="prod-field">
                <label>Preis (€)</label>
                <input
                  type="number"
                  value={p.price}
                  placeholder="0,00"
                  step="0.10"
                  onChange={e => setProductField(i, 'price', e.target.value)}
                />
              </div>
              <div className="prod-field">
                <label>Kategorie</label>
                <select value={p.category} onChange={e => setProductField(i, 'category', e.target.value)}>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="prod-card-row3">
              <span className="prod-color-label">Farbe</span>
              <div className="prod-color-swatches">
                {PRODUCT_COLORS.map(c => (
                  <button
                    key={c.id}
                    className={`color-swatch ${(p.color || 'none') === c.id ? 'active' : ''}`}
                    style={{ background: c.swatch }}
                    onClick={() => setProductColor(i, c.id)}
                    title={c.id}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <button className="btn btn-ghost btn-full" onClick={addProduct}>+ Produkt hinzufügen</button>
        <button className="btn btn-ghost btn-full" onClick={addSeparator}>+ Trennstrich</button>
      </div>

      {/* ── Speichern ── */}
      <button
        className="btn btn-primary btn-full"
        style={{ marginTop: '20px', opacity: saveState === 'saving' ? 0.7 : 1 }}
        onClick={handleSave}
        disabled={saveState === 'saving'}
      >
        {saveLabel}
      </button>

      {/* ── Event history ── */}
      <div className="section-title" style={{ marginTop: '32px' }}>
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
              <span style={{ color: 'var(--primary)', fontSize: '12px', fontWeight: 600 }}>Details →</span>
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
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span>{n}</span>
                <span>Soll {fmt(s)} | Ist {settlement.ist != null ? fmt(settlement.ist) : '–'}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Danger zone ── */}
      <div className="danger-zone">
        <h3>Veranstaltungsaktionen</h3>
        <p>
          <strong>Archivieren & Neu starten:</strong> Aktuelle Veranstaltung wird mit allen Daten archiviert,
          eine neue wird angelegt (Konfiguration bleibt erhalten).
        </p>
        <button className="btn btn-danger-outline btn-full" onClick={handleArchive}>
          Archivieren &amp; neue Veranstaltung starten
        </button>
        <p style={{ marginTop: '14px' }}>
          <strong>Nur Verkäufe zurücksetzen:</strong> Löscht Verkäufe und Abrechnungen des aktuellen Fests
          unwiderruflich. Konfiguration bleibt erhalten.
        </p>
        <button className="btn btn-danger-outline btn-full" onClick={handleReset}>
          Nur Verkäufe &amp; Abrechnungen zurücksetzen
        </button>
      </div>
    </section>
  );
}
