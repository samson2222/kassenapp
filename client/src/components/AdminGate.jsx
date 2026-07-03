import { useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';

export default function AdminGate() {
  const setAdminUnlocked = useStore(s => s.setAdminUnlocked);
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { ok } = await api.post('/api/auth/verify', { password: pw });
      if (ok) {
        setAdminUnlocked(true);
      } else {
        setError('Falsches Passwort.');
        setPw('');
      }
    } catch {
      setError('Verbindungsfehler.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-gate">
      <div className="admin-gate-box">
        <h2>Admin-Bereich</h2>
        <p>Bitte Passwort eingeben:</p>
        <form onSubmit={handleSubmit}>
          <div className="field-row">
            <input
              type="password"
              value={pw}
              onChange={e => setPw(e.target.value)}
              placeholder="Passwort"
              autoFocus
            />
          </div>
          {error && <div className="gate-error">{error}</div>}
          <button type="submit" className="btn btn-primary btn-full" disabled={loading || !pw}>
            {loading ? 'Prüfe…' : 'Entsperren'}
          </button>
        </form>
      </div>
    </div>
  );
}
