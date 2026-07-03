import { useEffect } from 'react';
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

  // SSE connection
  useEffect(() => {
    let es;
    function connect() {
      es = new EventSource('/api/stream');
      es.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'state') useStore.getState().setServerState(msg.data);
      };
      es.onerror = () => {
        es.close();
        setTimeout(connect, 3000); // manual reconnect with back-off
      };
    }
    connect();
    return () => es?.close();
  }, []);

  // Online/offline events
  useEffect(() => {
    const up   = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  const needsAuth = ADMIN_VIEWS.includes(activeView) && !adminUnlocked;

  return (
    <>
      <div id="app">
        <header className="top">
          <div className="title-block">
            <h1 id="event-name">{event?.name || 'Kassenapp'}</h1>
            <p>Kassenapp</p>
          </div>
          <div className="sync-status">
            <span className={`sync-dot ${!isOnline ? 'offline' : ''}`} />
            <span>
              {isOnline
                ? lastSync ? `aktualisiert ${fmtTime(lastSync)}` : 'verbinde…'
                : `Offline${pendingQueue.length > 0 ? ` · ${pendingQueue.length} wartend` : ''}`
              }
            </span>
          </div>
        </header>

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

      {activeView === 'kasse' && event && <CartBar />}

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
