import { create } from 'zustand';
import { api } from './api';

const QUEUE_KEY = 'kassenapp-queue';

function loadQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
  catch { return []; }
}
function persistQueue(q) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}
function uid() {
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export const useStore = create((set, get) => ({
  // ── Server state ──────────────────────────────────────────────────────────
  event: null,
  transactions: [],
  settlements: {},
  lastSync: null,

  // ── Local UI state ────────────────────────────────────────────────────────
  cart: {},
  activeBedienung: 0,
  activeCategory: 'Alle',
  activeView: 'kasse',
  cartOpen: false,

  // ── Auth (session only) ───────────────────────────────────────────────────
  adminUnlocked: false,

  // ── Connectivity ──────────────────────────────────────────────────────────
  isOnline: navigator.onLine,
  pendingQueue: loadQueue(),

  // ── Server state actions ──────────────────────────────────────────────────
  setServerState(data) {
    set({ event: data.event, transactions: data.transactions, settlements: data.settlements, lastSync: Date.now() });
  },

  // ── UI actions ────────────────────────────────────────────────────────────
  setView(view) { set({ activeView: view }); },
  setActiveBedienung(i) { set({ activeBedienung: i }); },
  setActiveCategory(cat) { set({ activeCategory: cat }); },
  toggleCart() { set(s => ({ cartOpen: !s.cartOpen })); },
  clearCart() { set({ cart: {}, cartOpen: false }); },
  setAdminUnlocked(v) { set({ adminUnlocked: v }); },

  addToCart(productId) {
    set(s => ({ cart: { ...s.cart, [productId]: (s.cart[productId] || 0) + 1 } }));
  },

  // ── API actions ───────────────────────────────────────────────────────────
  async bookSale() {
    const { cart, activeBedienung, event, pendingQueue } = get();
    const products = event?.config?.products || [];
    const items = Object.entries(cart)
      .filter(([, q]) => q > 0)
      .map(([pid, qty]) => {
        const p = products.find(pp => pp.id === pid);
        return { productId: pid, name: p?.name || '', price: p?.price || 0, qty };
      });
    if (!items.length) return;
    const total = items.reduce((s, i) => s + i.price * i.qty, 0);
    const tx = { id: uid(), bedienungIndex: activeBedienung, items, total, ts: Date.now() };
    set({ cart: {}, cartOpen: false });
    try {
      await api.post('/api/transactions', tx);
    } catch {
      const q = [...pendingQueue, tx];
      set({ pendingQueue: q });
      persistQueue(q);
    }
  },

  async voidTx(id) {
    await api.patch(`/api/transactions/${id}/void`);
  },

  async saveSettlement(bedienungIndex, updates) {
    return api.put(`/api/settlements/${bedienungIndex}`, updates);
  },

  async updateConfig(config) {
    await api.put('/api/config', config);
  },

  async resetEvent() {
    await api.post('/api/events/reset');
  },

  async archiveEvent(newName) {
    await api.post('/api/events/archive', { newName });
  },

  // ── Offline ───────────────────────────────────────────────────────────────
  setOnline(v) {
    set({ isOnline: v });
    if (v) get().flushQueue();
  },

  async flushQueue() {
    const { pendingQueue } = get();
    if (!pendingQueue.length) return;
    const remaining = [];
    for (const tx of pendingQueue) {
      try { await api.post('/api/transactions', tx); }
      catch (e) {
        if (e.status !== 409) remaining.push(tx); // 409 = already booked, skip
      }
    }
    set({ pendingQueue: remaining });
    persistQueue(remaining);
  },
}));
