import { useStore } from '../store';
import { PRODUCT_COLORS } from './Einstellungen';


function fmt(n) {
  return (Math.round(n * 100) / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
function soll(transactions, bIndex) {
  return transactions.filter(t => t.bedienungIndex === bIndex && !t.voided).reduce((s, t) => s + t.total, 0);
}

export default function Kasse() {
  const {
    event, transactions, cart,
    activeBedienung, setActiveBedienung,
    activeCategory, setActiveCategory,
    addToCart,
  } = useStore();

  const cfg = event?.config || {};
  const names = (cfg.bedienungenNames || []).slice(0, cfg.bedienungenCount || 0);
  const products = cfg.products || [];
  const categories = ['Alle', ...new Set(products.filter(p => p.type !== 'separator').map(p => p.category))];
  const visible = activeCategory === 'Alle'
    ? products
    : products.filter(p => p.type !== 'separator' && p.category === activeCategory);
  return (
    <section id="view-kasse">
      {/* Bedienung selector */}
      <div className="bedienung-row">
        {names.map((n, i) => (
          <button key={i} className={`token ${i === activeBedienung ? 'active' : ''}`} onClick={() => setActiveBedienung(i)}>
            <div className="circle">{i + 1}</div>
            <div className="token-info">
              <div className="name">{n}</div>
              <div className="sub">{fmt(soll(transactions, i))}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Category filter */}
      <div className="cat-row">
        {categories.map(c => (
          <button key={c} className={`cat-chip ${c === activeCategory ? 'active' : ''}`} onClick={() => setActiveCategory(c)}>
            {c}
          </button>
        ))}
      </div>

      {/* Product grid */}
      <div className="product-grid">
        {visible.map(p => {
          if (p.type === 'separator') {
            return (
              <div key={p.id} className="product-separator">
                {p.name && <span>{p.name}</span>}
              </div>
            );
          }
          const qty = cart[p.id] || 0;
          const colorDef = PRODUCT_COLORS.find(c => c.id === (p.color || 'none'));
          const cardStyle = colorDef?.border
            ? { borderLeftColor: colorDef.border, borderLeftWidth: 4, background: colorDef.bg }
            : {};
          return (
            <button key={p.id} className="product-card" style={cardStyle} onClick={() => addToCart(p.id)}>
              {qty > 0 && <span className="qty-badge">{qty}</span>}
              <span className="pname">{p.name}</span>
              <span className="pprice">{fmt(p.price)}</span>
            </button>
          );
        })}
      </div>

    </section>
  );
}

// CartBar is rendered by App.jsx but needs Kasse store state
export function CartBar() {
  const { event, cart, activeBedienung, cartOpen, toggleCart, clearCart, bookSale } = useStore();
  const cfg = event?.config || {};
  const products = cfg.products || [];
  const names = (cfg.bedienungenNames || []).slice(0, cfg.bedienungenCount || 0);

  const items = Object.entries(cart).filter(([, q]) => q > 0);
  let total = 0, count = 0;
  const lines = items.map(([pid, qty]) => {
    const p = products.find(pp => pp.id === pid);
    if (!p) return null;
    total += p.price * qty;
    count += qty;
    return { key: pid, label: `${qty}× ${p.name}`, amount: fmt(p.price * qty) };
  }).filter(Boolean);

  return (
    <div className="cart-bar">
      <div className={`cart-items ${cartOpen ? 'open' : ''}`}>
        {lines.length === 0
          ? <div className="empty-hint">Warenkorb leer</div>
          : lines.map(l => (
            <div key={l.key} className="cart-line">
              <span className="lname">{l.label}</span>
              <span className="lmeta">{l.amount}</span>
            </div>
          ))
        }
      </div>
      <div className="cart-summary" onClick={toggleCart} style={{ cursor: 'pointer' }}>
        <div className="info">{names[activeBedienung] || ''} · {count} Artikel</div>
        <div className="total">{fmt(total)}</div>
      </div>
      <div className="cart-actions">
        <button className="btn btn-ghost" onClick={clearCart}>Leeren</button>
        <button className="btn btn-primary" disabled={count === 0} onClick={bookSale}>Buchen</button>
      </div>
    </div>
  );
}
