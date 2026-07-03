import { useEffect, useState } from 'react';
import { useStore } from './store';
import Kasse, { CartBar } from './views/Kasse';
import Verlauf from './views/Verlauf';
import Bedienungen from './views/Bedienungen';
import Abrechnung from './views/Abrechnung';
import Einstellungen from './views/Einstellungen';
import AdminGate from './components/AdminGate';
import './App.css';

const NAV = [
  { key: 'kasse',         label: 'Kasse' },
  { key: 'verlauf',       label: 'Verlauf' },
  { key: 'bedienungen',   label: 'Bedienungen' },
  { key: 'abrechnung',    label: 'Abrechnung' },
  { key: 'einstellungen', label: 'Einstellungen' },
];
const ADMIN_VIEWS = ['abrechnung', 'einstellungen'];

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export default function App() {
  const { event, activeView, setView, setServerState, setOnline, isOnline, pendingQueue, adminUnlocked, lastSync } = useStore();
  const [connected, setConnected] = useState(false);
  const [everConnected, setEverConnected] = useState(false);

  // Consolidated connection manager: SSE + online/offline + visibilitychange
  useEffect(() => {
    let es;
    let timer;

    function connect() {
      if (es) { try { es.close(); } catch {} }
      clearTimeout(timer);
      es = new EventSource('/api/stream');
      es.onmessage = (e) => {
        setConnected(true);
        setEverConnected(true);
        const msg = JSON.parse(e.data);
        if (msg.type === 'state') useStore.getState().setServerState(msg.data);
      };
      es.onerror = () => {
        setConnected(false);
        try { es.close(); } catch {}
        timer = setTimeout(connect, 3000);
      };
    }

    const onVisible = () => { if (document.visibilityState === 'visible') connect(); };
    const onOnline  = () => { useStore.getState().setOnline(true);  connect(); };
    const onOffline = () => { useStore.getState().setOnline(false); setConnected(false); };

    connect();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      try { es?.close(); } catch {}
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const needsAuth     = ADMIN_VIEWS.includes(activeView) && !adminUnlocked;
  const showCartBar   = activeView === 'kasse' && !!event;
  const disconnected  = everConnected && !connected;

  return (
    <>
      <div id="app">
        <header className="top">
          <div className="title-block">
            <h1 id="event-name">{event?.name || 'Kassenapp'}</h1>
            <p>Kassenapp</p>
          </div>
          <div className="sync-status">
            <span className={`sync-dot ${!isOnline || disconnected ? 'offline' : ''}`} />
            <span>
              {!isOnline
                ? `Offline${pendingQueue.length > 0 ? ` · ${pendingQueue.length} wartend` : ''}`
                : disconnected
                  ? 'Verbindung getrennt…'
                  : lastSync ? `aktualisiert ${fmtTime(lastSync)}` : 'verbinde…'
              }
            </span>
          </div>
        </header>

        {disconnected && (
          <div className="reconnect-banner">
            Verbindung zum Server unterbrochen – Daten werden möglicherweise nicht aktualisiert.
          </div>
        )}

        <main>
          {!event ? (
            <div className="empty-hint" style={{ paddingTop: '60px' }}>Lädt…</div>
          ) : needsAuth ? (
            <AdminGate />
          ) : (
            <>
              {activeView === 'kasse'         && <Kasse />}
              {activeView === 'verlauf'       && <Verlauf />}
              {activeView === 'bedienungen'   && <Bedienungen />}
              {activeView === 'abrechnung'    && <Abrechnung />}
              {activeView === 'einstellungen' && <Einstellungen />}
            </>
          )}
        </main>
      </div>

      {showCartBar && <CartBar />}

      <nav id="bottom-nav">
        {NAV.map(({ key, label }) => (
          <button
            key={key}
            className={activeView === key ? 'active' : ''}
            onClick={() => setView(key)}
          >
            <span className="dot" />
            {label}
          </button>
        ))}
      </nav>
    </>
  );
}
