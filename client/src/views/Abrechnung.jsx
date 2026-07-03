import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';

function fmt(n) {
  return (Math.round(n * 100) / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
function toNum(v) {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}
function soll(transactions, bIndex) {
  return transactions
    .filter(t => t.bedienungIndex === bIndex && !t.voided)
    .reduce((s, t) => s + t.total, 0);
}

export default function Abrechnung() {
  const { event, transactions, settlements, saveSettlement } = useStore();

  // Local display state (controlled inputs)
  const [istValues,       setIstValues]       = useState({});
  const [startgeldValues, setStartgeldValues] = useState({});
  const [saveStates,      setSaveStates]      = useState({});

  // Refs always hold the latest typed value – doSave reads from here, never from state
  const istRef            = useRef({});
  const startgeldRef      = useRef({});
  const autoSaveTimers    = useRef({});
  // Track which event we loaded from, so we re-sync on event change
  const loadedForEvent    = useRef(null);

  const cfg        = event?.config || {};
  const names      = (cfg.bedienungenNames || []).slice(0, cfg.bedienungenCount || 0);
  const provisions = cfg.bedienungenProvision || [];

  // ── ONE-TIME sync from server ──────────────────────────────────────────────
  // Runs when the component mounts (or when the event changes).
  // After this initial load we NEVER update the input values from SSE again –
  // that was the root cause: SSE arriving after save was overwriting what the
  // user just typed.
  useEffect(() => {
    if (!event) return;
    if (loadedForEvent.current === event.id) return; // already loaded for this event

    const newIst       = {};
    const newStartgeld = {};
    names.forEach((_, i) => {
      const s = settlements[i];
      newIst[i]              = s?.ist       != null ? String(s.ist)       : '';
      newStartgeld[i]        = s?.startgeld != null ? String(s.startgeld) : '';
      istRef.current[i]      = newIst[i];
      startgeldRef.current[i]= newStartgeld[i];
    });
    setIstValues(newIst);
    setStartgeldValues(newStartgeld);
    loadedForEvent.current = event.id;
  }, [event, settlements]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup debounce timers on unmount
  useEffect(() => () => {
    Object.values(autoSaveTimers.current).forEach(clearTimeout);
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────
  // Reads from refs (fresh, no stale closure). After save the server returns
  // the row it actually wrote to the DB – we update local state from that
  // confirmed value, not from SSE. This makes saving bullet-proof.
  async function doSave(i) {
    const ist       = toNum(istRef.current[i]);
    const startgeld = toNum(startgeldRef.current[i]);
    setSaveStates(s => ({ ...s, [i]: 'saving' }));
    try {
      const result = await saveSettlement(i, { ist, startgeld });
      // Update display from what the server actually wrote to DB
      const saved = result?.saved;
      if (saved) {
        const confirmedIst       = saved.ist       != null ? String(saved.ist)       : '';
        const confirmedStartgeld = saved.startgeld != null ? String(saved.startgeld) : '';
        istRef.current[i]       = confirmedIst;
        startgeldRef.current[i] = confirmedStartgeld;
        setIstValues(v       => ({ ...v, [i]: confirmedIst }));
        setStartgeldValues(v => ({ ...v, [i]: confirmedStartgeld }));
      }
      setSaveStates(s => ({ ...s, [i]: 'saved' }));
      setTimeout(() => setSaveStates(s => ({ ...s, [i]: 'idle' })), 2000);
    } catch (err) {
      console.error('[Abrechnung] saveSettlement error:', err);
      setSaveStates(s => ({ ...s, [i]: 'error' }));
      setTimeout(() => setSaveStates(s => ({ ...s, [i]: 'idle' })), 3000);
    }
  }

  function scheduleAutoSave(i) {
    clearTimeout(autoSaveTimers.current[i]);
    autoSaveTimers.current[i] = setTimeout(() => doSave(i), 800);
  }

  function onIstChange(i, val) {
    istRef.current[i] = val;          // update ref immediately
    setIstValues(v => ({ ...v, [i]: val }));
    scheduleAutoSave(i);
  }

  function onStartgeldChange(i, val) {
    startgeldRef.current[i] = val;    // update ref immediately
    setStartgeldValues(v => ({ ...v, [i]: val }));
    scheduleAutoSave(i);
  }

  async function handleClose(i, closed) {
    const ist       = toNum(istRef.current[i]);
    const startgeld = toNum(startgeldRef.current[i]);
    await saveSettlement(i, { ist, startgeld, closed });
  }

  function copySummary() {
    const lines = [`${event.name} – Abrechnung`, ''];
    let tSoll = 0, tNetto = 0, tVerdienst = 0;
    names.forEach((n, i) => {
      const s         = soll(transactions, i);
      const sv        = settlements[i] || {};
      const ist       = sv.ist       != null ? Number(sv.ist)       : null;
      const startgeld = sv.startgeld != null ? Number(sv.startgeld) : 0;
      const pct       = provisions[i] ?? 10;
      tSoll += s;
      if (ist !== null) {
        const netto     = ist - startgeld;
        const verdienst = s * (pct / 100);
        tNetto     += netto;
        tVerdienst += verdienst;
        lines.push(`${n}: Soll ${fmt(s)} | Startgeld ${fmt(startgeld)} | Ist ${fmt(ist)} | Netto ${fmt(netto)} | Verdienst (${pct}%) ${fmt(verdienst)} | Abzugeben ${fmt(netto - verdienst)} | Diff ${fmt(netto - s)}`);
      } else {
        lines.push(`${n}: Soll ${fmt(s)} | Noch nicht abgerechnet`);
      }
    });
    lines.push('', `Gesamt: Soll ${fmt(tSoll)} | Netto ${fmt(tNetto)} | Verdienst ${fmt(tVerdienst)} | Abzugeben ${fmt(tNetto - tVerdienst)}`);
    navigator.clipboard?.writeText(lines.join('\n'));
  }

  // Global totals from committed server values
  let totalSoll = 0, totalNetto = 0, totalVerdienst = 0;
  names.forEach((_, i) => {
    const s  = soll(transactions, i);
    totalSoll += s;
    const sv = settlements[i];
    if (sv?.ist != null) {
      const netto = Number(sv.ist) - (sv.startgeld != null ? Number(sv.startgeld) : 0);
      totalNetto     += netto;
      totalVerdienst += s * ((provisions[i] ?? 10) / 100);
    }
  });

  return (
    <section id="view-abrechnung">
      <div className="print-header">
        <h2>{event?.name} – Abrechnung</h2>
        <p>{new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
      </div>

      <div className="section-title">Gesamtübersicht</div>
      <div className="summary-grid summary-grid-4">
        <div className="metric"><div className="mlabel">Soll gesamt</div>        <div className="mval">{fmt(totalSoll)}</div></div>
        <div className="metric"><div className="mlabel">Netto gesamt</div>       <div className="mval">{fmt(totalNetto)}</div></div>
        <div className="metric"><div className="mlabel">Verdienst gesamt</div>   <div className="mval">{fmt(totalVerdienst)}</div></div>
        <div className="metric">
          <div className="mlabel">Abzugeben gesamt</div>
          <div className="mval" style={{ color: 'var(--primary)' }}>{fmt(totalNetto - totalVerdienst)}</div>
        </div>
      </div>

      <div className="section-title">Je Bedienung</div>
      {names.map((name, i) => {
        const settlement    = settlements[i] || {};
        const s             = soll(transactions, i);
        const pct           = provisions[i] ?? 10;
        const localIst      = toNum(istValues[i] ?? '');
        const localStartgeld= toNum(startgeldValues[i] ?? '') ?? 0;
        const netto         = localIst !== null ? localIst - localStartgeld : null;
        const verdienst     = netto    !== null ? s * (pct / 100) : null;
        const abzugeben     = verdienst!== null ? netto - verdienst : null;
        const diff          = netto    !== null ? netto - s : null;
        const diffCls       = diff === null ? '' : Math.abs(diff) < 0.005 ? 'match' : diff < 0 ? 'minus' : 'plus';
        const hasIst        = localIst !== null;
        const ss            = saveStates[i] || 'idle';
        const saveLabel     = ss === 'saving' ? 'Speichert…' : ss === 'saved' ? '✓ Gespeichert' : ss === 'error' ? '✗ Fehler – nochmal versuchen' : 'Speichern';

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
                <label>Startgeld (€)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  className="ist-input"
                  value={startgeldValues[i] ?? ''}
                  placeholder="0,00"
                  disabled={!!settlement.closed}
                  onChange={e => onStartgeldChange(i, e.target.value)}
                  onBlur={() => doSave(i)}
                />
              </div>
              <div className="ar-field">
                <label>Ist – Kassensturz (€)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  className="ist-input"
                  value={istValues[i] ?? ''}
                  placeholder="0,00"
                  disabled={!!settlement.closed}
                  onChange={e => onIstChange(i, e.target.value)}
                  onBlur={() => doSave(i)}
                />
              </div>
            </div>

            {hasIst && (
              <div className="ar-breakdown">
                <div className="ar-breakdown-row">
                  <span>Soll (App-Umsatz)</span>
                  <span>{fmt(s)}</span>
                </div>
                <div className="ar-breakdown-row">
                  <span>Netto (Ist − Startgeld)</span>
                  <span>{fmt(netto)}</span>
                </div>
                <div className="ar-breakdown-row">
                  <span>Differenz</span>
                  <span className={`diff-val ${diffCls}`}>{diff >= 0 ? '+' : ''}{fmt(diff)}</span>
                </div>
                <div className="ar-breakdown-divider" />
                <div className="ar-breakdown-row">
                  <span>Verdienst Bedienung ({pct}% v. Soll)</span>
                  <span className="ar-verdienst">{fmt(verdienst)}</span>
                </div>
                <div className="ar-breakdown-abzugeben">
                  <span>Abzugeben an Kasse</span>
                  <span>{fmt(abzugeben)}</span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }} className="no-print">
              {settlement.closed ? (
                <button className="btn btn-ghost" onClick={() => handleClose(i, false)}>Wieder öffnen</button>
              ) : (
                <>
                  <button
                    className={`btn btn-ghost ${ss === 'error' ? 'btn-danger-outline' : ''}`}
                    style={{ opacity: ss === 'saving' ? 0.7 : 1 }}
                    disabled={ss === 'saving'}
                    onClick={() => doSave(i)}
                  >
                    {saveLabel}
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    disabled={!hasIst || ss === 'saving'}
                    onClick={() => handleClose(i, true)}
                  >
                    Abschließen
                  </button>
                </>
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
