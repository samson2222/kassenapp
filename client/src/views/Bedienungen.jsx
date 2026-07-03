import { useStore } from '../store';

function fmt(n) {
  return (Math.round(n * 100) / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

function soll(transactions, bIndex) {
  return transactions.filter(t => t.bedienungIndex === bIndex && !t.voided).reduce((s, t) => s + t.total, 0);
}
function txCount(transactions, bIndex) {
  return transactions.filter(t => t.bedienungIndex === bIndex && !t.voided).length;
}

export default function Bedienungen() {
  const { event, transactions } = useStore();
  const cfg = event?.config || {};
  const names = (cfg.bedienungenNames || []).slice(0, cfg.bedienungenCount || 0);

  return (
    <section id="view-bedienungen">
      <div className="section-title">Übersicht je Bedienung (nur lesend)</div>
      <div className="bedienungen-grid">
        {names.map((n, i) => (
          <div key={i} className="b-card">
            <div className="bnum">Bedienung {i + 1}</div>
            <div className="bname">{n}</div>
            <div className="btotal">{fmt(soll(transactions, i))}</div>
            <div className="bcount">{txCount(transactions, i)} Verkäufe</div>
          </div>
        ))}
      </div>
    </section>
  );
}
