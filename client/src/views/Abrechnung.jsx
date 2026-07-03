import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';

function fmt(n) {
  return (Math.round(n * 100) / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
function soll(transactions, bIndex) {
  return transactions.filter(t => t.bedienungIndex === bIndex && !t.voided).reduce((s, t) => s + t.total, 0);
}

export default function Abrechnung() {
  const { event, transactions, settlements, saveSettlement } = useStore();
  const [istValues, setIstValues]             = useState({});
  const [startgeldValues, setStartgeldValues] = useState({});
  // dirty flags: true while user is editing, prevents SSE from overwriting local input
  const istDirty       = useRef({});
  const startgeldDirty = useRef({});

  const cfg        = event?.config || {};
  const names      = (cfg.bedienungenNames || []).slice(0, cfg.bedienungenCount || 0);
  const provisions = cfg.bedienungenProvision || [];

  // Sync from server – only update fields the user is NOT currently editing
  useEffect(() => {
    setIstValues(prev => {
      const next = { ...prev };
      names.forEach((_, i) => {
        if (istDirty.current[i]) return;
        const s = settlements[i];
        next[i] = s?.ist != null ? String(s.ist) : '';
      });
      return next;
    });
    setStartgeldValues(prev => {
      const next = { ...prev };
      names.forEach((_, i) => {
        if (startgeldDirty.current[i]) return;
        const s = settlements[i];
        next[i] = s?.startgeld != null ? String(s.startgeld) : '';
      });
      return next;
    });
  }, [settlements]);

  // Gesamttotals
  let totalSoll = 0, totalNetto = 0, totalProvision = 0;
  names.forEach((_, i) => {
    totalSoll += soll(transactions, i);
    const s = settlements[i];
    if (s?.ist != null) {
      const netto = Number(s.ist) - (s.startgeld != null ? Number(s.startgeld) : 0);
      const pct   = provisions[i] ?? 10;
      totalNetto     += netto;
      totalProvision += netto * (pct / 100);
    }
  });
  const totalAuszahlung = totalNetto - totalProvision;

  async function handleIstBlur(i) {
    const val = istValues[i] ?? '';
    await saveSettlement(i, { ist: val === '' ? null : Number(val) });
    istDirty.current[i] = false;
  }

  async function handleStartgeldBlur(i) {
    const val = startgeldValues[i] ?? '';
    await saveSettlement(i, { startgeld: val === '' ? null : Number(val) });
    startgeldDirty.current[i] = false;
  }

  async function handleClose(i, closed) {
    await saveSettlement(i, { closed });
  }

  function copySummary() {
    const lines = [`${event.name} – Abrechnung`, ''];
    let tSoll = 0, tNetto = 0, tProvision = 0;
    names.forEach((n, i) => {
      const s          = soll(transactions, i);
      const settlement = settlements[i] || {};
      const ist        = settlement.ist != null ? Number(settlement.ist) : null;
      const startgeld  = settlement.startgeld != null ? Number(settlement.startgeld) : 0;
      const pct        = provisions[i] ?? 10;
      tSoll += s;
      if (ist !== null) {
        const netto     = ist - startgeld;
        const provision = netto * (pct / 100);
        tNetto     += netto;
        tProvision += provision;
        lines.push(
          `${n}: Soll ${fmt(s)} | Startgeld ${fmt(startgeld)} | Ist ${fmt(ist)} | Netto ${fmt(netto)} | Provision (${pct}%) ${fmt(provision)} | Auszahlung ${fmt(netto - provision)} | Diff ${fmt(netto - s)}`
        );
      } else {
        lines.push(`${n}: Soll ${fmt(s)} | Noch nicht abgerechnet`);
      }
    });
    const tAuszahlung = tNetto - tProvision;
    lines.push('', `Gesamt: Soll ${fmt(tSoll)} | Netto ${fmt(tNetto)} | Provision ${fmt(tProvision)} | Auszahlung ${fmt(tAuszahlung)}`);
    navigator.clipboard?.writeText(lines.join('\n'));
  }

  return (
    <section id="view-abrechnung">
      <div className="print-header">
        <h2>{event?.name} – Abrechnung</h2>
        <p>{new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
      </div>

      <div className="section-title">Gesamtübersicht</div>
      <div className="summary-grid summary-grid-4">
        <div className="metric">
          <div className="mlabel">Soll gesamt</div>
          <div className="mval">{fmt(totalSoll)}</div>
        </div>
        <div className="metric">
          <div className="mlabel">Netto gesamt</div>
          <div className="mval">{fmt(totalNetto)}</div>
        </div>
        <div className="metric">
          <div className="mlabel">Provision gesamt</div>
          <div className="mval">{fmt(totalProvision)}</div>
        </div>
        <div className="metric">
          <div className="mlabel">Auszahlung gesamt</div>
          <div className="mval" style={{ color: 'var(--primary)' }}>{fmt(totalAuszahlung)}</div>
        </div>
      </div>

      <div className="section-title">Je Bedienung</div>
      {names.map((name, i) => {
        const s          = soll(transactions, i);
        const settlement = settlements[i] || {};
        const hasIst     = settlement.ist != null;
        const ist        = hasIst ? Number(settlement.ist) : null;
        const startgeld  = settlement.startgeld != null ? Number(settlement.startgeld) : 0;
        const netto      = ist !== null ? ist - startgeld : null;
        const pct        = provisions[i] ?? 10;
        const provision  = netto !== null ? netto * (pct / 100) : null;
        const auszahlung = provision !== null ? netto - provision : null;
        const diff       = netto !== null ? netto - s : null;
        const diffCls    = diff === null ? '' : Math.abs(diff) < 0.005 ? 'match' : diff < 0 ? 'minus' : 'plus';

        return (
          <div key={i} className="abrechnung-row">
            <div className="abrechnung-head">
              <span className="aname">{name}</span>
              <span className={`status-pill ${settlement.closed ? 'zu' : 'offen'}`}>
                {settlement.closed ? 'Abgerechnet' : 'Offen'}
              </span>
            </div>

            {/* Eingaben */}
            <div className="ar-grid">
              <div className="ar-field">
                <label>Startgeld (€)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  className="ist-input"
                  value={startgeldValues[i] ?? ''}
                  placeholder="0,00"
                  disabled={settlement.closed}
                  onChange={e => {
                    startgeldDirty.current[i] = true;
                    setStartgeldValues(v => ({ ...v, [i]: e.target.value }));
                  }}
                  onBlur={() => handleStartgeldBlur(i)}
                />
              </div>
              <div className="ar-field">
                <label>Ist (gezähltes Bargeld)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  className="ist-input"
                  value={istValues[i] ?? ''}
                  placeholder="0,00"
                  disabled={settlement.closed}
                  onChange={e => {
                    istDirty.current[i] = true;
                    setIstValues(v => ({ ...v, [i]: e.target.value }));
                  }}
                  onBlur={() => handleIstBlur(i)}
                />
              </div>
            </div>

            {/* Berechnete Felder */}
            <div className="ar-derived">
              <div className="ar-field">
                <label>Soll (App)</label>
                <div className="val">{fmt(s)}</div>
              </div>
              <div className="ar-field">
                <label>Netto</label>
                <div className="val">{netto !== null ? fmt(netto) : '–'}</div>
              </div>
              <div className="ar-field">
                <label>Provision ({pct}%)</label>
                <div className="val">{provision !== null ? fmt(provision) : '–'}</div>
              </div>
              <div className="ar-field">
                <label>Auszahlung</label>
                <div className="val" style={{ color: auszahlung !== null ? 'var(--primary)' : undefined }}>
                  {auszahlung !== null ? fmt(auszahlung) : '–'}
                </div>
              </div>
            </div>

            <div className="diff-line">
              <span>Differenz (Netto – Soll)</span>
              {diff !== null ? (
                <span className={`diff-val ${diffCls}`}>{diff >= 0 ? '+' : ''}{fmt(diff)}</span>
              ) : (
                <span className="diff-val" style={{ color: 'var(--text-faint)' }}>–</span>
              )}
            </div>

            <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }} className="no-print">
              {settlement.closed ? (
                <button className="btn btn-ghost" onClick={() => handleClose(i, false)}>Wieder öffnen</button>
              ) : (
                <button className="btn btn-primary" onClick={() => handleClose(i, true)} disabled={!hasIst}>
                  Abschließen
                </button>
              )}
            </div>
          </div>
        );
      })}

      <div className="no-print" style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => window.print()}>Drucken / PDF</button>
        <button className="btn" style={{ flex: 1 }} onClick={copySummary}>Zusammenfassung kopieren</button>
      </div>
    </section>
  );
}
