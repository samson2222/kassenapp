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
  const [istValues, setIstValues] = useState({});
  const inputRefs = useRef({});

  const cfg = event?.config || {};
  const names = (cfg.bedienungenNames || []).slice(0, cfg.bedienungenCount || 0);

  // Sync ist values from server, but skip inputs currently focused
  useEffect(() => {
    setIstValues(prev => {
      const next = { ...prev };
      names.forEach((_, i) => {
        if (document.activeElement === inputRefs.current[i]) return;
        const s = settlements[i];
        next[i] = (s?.ist != null) ? String(s.ist) : '';
      });
      return next;
    });
  }, [settlements]);

  let totalSoll = 0, totalIst = 0;
  names.forEach((_, i) => {
    totalSoll += soll(transactions, i);
    const s = settlements[i];
    if (s?.ist != null) totalIst += Number(s.ist);
  });
  const totalDiff = totalIst - totalSoll;
  const totalDiffCls = Math.abs(totalDiff) < 0.005 ? 'match' : totalDiff < 0 ? 'minus' : 'plus';

  async function handleIstBlur(i) {
    const val = istValues[i];
    await saveSettlement(i, { ist: val === '' ? null : Number(val) });
  }

  async function handleClose(i, closed) {
    const s = settlements[i] || {};
    await saveSettlement(i, { ist: s.ist, closed });
  }

  function copySummary() {
    const lines = [`${event.name} – Abrechnung`, ''];
    let tSoll = 0, tIst = 0;
    names.forEach((n, i) => {
      const s = soll(transactions, i);
      const settlement = settlements[i] || {};
      const ist = settlement.ist != null ? Number(settlement.ist) : null;
      tSoll += s;
      if (ist !== null) tIst += ist;
      lines.push(`${n}: Soll ${fmt(s)} | Ist ${ist !== null ? fmt(ist) : '–'} | Diff ${ist !== null ? fmt(ist - s) : '–'}`);
    });
    lines.push('', `Gesamt: Soll ${fmt(tSoll)} | Ist ${fmt(tIst)} | Diff ${fmt(tIst - tSoll)}`);
    navigator.clipboard?.writeText(lines.join('\n'));
  }

  return (
    <section id="view-abrechnung">
      {/* Print header – only visible when printing */}
      <div className="print-header">
        <h2>{event?.name} – Abrechnung</h2>
        <p>{new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
      </div>

      <div className="section-title">Gesamtübersicht</div>
      <div className="summary-grid">
        <div className="metric"><div className="mlabel">Soll gesamt</div><div className="mval">{fmt(totalSoll)}</div></div>
        <div className="metric"><div className="mlabel">Ist gesamt</div><div className="mval">{fmt(totalIst)}</div></div>
        <div className="metric">
          <div className="mlabel">Differenz</div>
          <div className="mval" style={{ color: `var(--${totalDiffCls === 'match' ? 'green' : totalDiffCls === 'minus' ? 'red' : 'blue'})` }}>
            {totalDiff >= 0 ? '+' : ''}{fmt(totalDiff)}
          </div>
        </div>
      </div>

      <div className="section-title">Je Bedienung</div>
      {names.map((name, i) => {
        const s = soll(transactions, i);
        const settlement = settlements[i] || {};
        const hasIst = settlement.ist != null;
        const ist = hasIst ? Number(settlement.ist) : null;
        const diff = ist !== null ? ist - s : null;
        const diffCls = diff === null ? '' : Math.abs(diff) < 0.005 ? 'match' : diff < 0 ? 'minus' : 'plus';

        return (
          <div key={i} className="abrechnung-row">
            <div className="abrechnung-head">
              <span className="aname">{name}</span>
              <span className={`status-pill ${settlement.closed ? 'zu' : 'offen'}`}>
                {settlement.closed ? 'Abgerechnet' : 'Offen'}
              </span>
            </div>
            <div className="ar-grid">
              <div className="ar-field">
                <label>Soll (App-Umsatz)</label>
                <div className="val">{fmt(s)}</div>
              </div>
              <div className="ar-field">
                <label>Ist (gezähltes Bargeld)</label>
                <input
                  ref={el => { inputRefs.current[i] = el; }}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  className="ist-input"
                  value={istValues[i] ?? ''}
                  placeholder="0,00"
                  disabled={settlement.closed}
                  onChange={e => setIstValues(v => ({ ...v, [i]: e.target.value }))}
                  onBlur={() => handleIstBlur(i)}
                />
              </div>
            </div>
            <div className="diff-line">
              <span>Differenz</span>
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
