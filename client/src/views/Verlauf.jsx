import { useState } from 'react';
import { useStore } from '../store';

function fmt(n) {
  return (Math.round(n * 100) / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export default function Verlauf() {
  const { event, transactions, voidTx } = useStore();
  const [filter, setFilter] = useState(-1); // -1 = Alle

  const cfg   = event?.config || {};
  const names = (cfg.bedienungenNames || []).slice(0, cfg.bedienungenCount || 0);

  const sorted   = [...transactions].reverse();
  const filtered = filter === -1 ? sorted : sorted.filter(t => t.bedienungIndex === filter);

  const activeCount  = filtered.filter(t => !t.voided).length;
  const activeTotal  = filtered.filter(t => !t.voided).reduce((s, t) => s + t.total, 0);

  async function handleVoid(id) {
    if (confirm('Diesen Verkauf stornieren?')) await voidTx(id);
  }

  return (
    <section id="view-verlauf">
      {/* Filter chips */}
      <div className="cat-row">
        <button className={`cat-chip ${filter === -1 ? 'active' : ''}`} onClick={() => setFilter(-1)}>
          Alle
        </button>
        {names.map((n, i) => (
          <button key={i} className={`cat-chip ${filter === i ? 'active' : ''}`} onClick={() => setFilter(i)}>
            {n}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="verlauf-summary">
        <span>{activeCount} Verkäufe</span>
        <span className="verlauf-total">{fmt(activeTotal)}</span>
      </div>

      {/* Transactions */}
      {filtered.length === 0 ? (
        <div className="empty-hint">Noch keine Verkäufe gebucht.</div>
      ) : (
        <section className="card">
          {filtered.map((t, idx) => {
            const bname    = names[t.bedienungIndex] || `Bedienung ${t.bedienungIndex + 1}`;
            const count    = t.items.reduce((s, i) => s + i.qty, 0);
            const prevDate = idx > 0 ? fmtDate(filtered[idx - 1].ts) : null;
            const thisDate = fmtDate(t.ts);
            const showDate = prevDate !== thisDate;
            return (
              <div key={t.id}>
                {showDate && (
                  <div className="verlauf-date-divider">{thisDate}</div>
                )}
                <div className={`recent-item ${t.voided ? 'void' : ''}`}>
                  <div>
                    <div>{bname}</div>
                    <div className="rmeta">
                      {fmtTime(t.ts)} · {count} Artikel
                      {t.voided && <span className="void-badge">Storniert</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="ramount">{fmt(t.total)}</span>
                    {!t.voided && (
                      <button className="link-btn" onClick={() => handleVoid(t.id)}>Stornieren</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </section>
  );
}
