import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('kushagra@vayuz.com');
  const [password, setPassword] = useState('Passw0rd!');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate('/');
    } catch {
      setError('Invalid email or password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div className="card pad" style={{ width: 380, maxWidth: '100%' }}>
        <div className="brand" style={{ padding: '0 0 16px' }}>
          <div className="mark">P</div>
          <div>
            <div className="bn" style={{ color: 'var(--text)' }}>
              PPG Pulse
            </div>
            <div className="bs">VAYUZ People Group</div>
          </div>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Sign in</h2>
        <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
          Delivery &amp; performance cockpit
        </p>
        <form onSubmit={onSubmit}>
          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="field" style={{ marginBottom: 18 }}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && (
            <div className="pill p-red" role="alert" style={{ marginBottom: 14, display: 'block' }}>
              {error}
            </div>
          )}
          <button type="submit" className="btn btn-pri" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
