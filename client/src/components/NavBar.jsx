import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function NavBar() {
  const { user, loading, login, logout } = useAuth();

  return (
    <header style={{
      borderBottom: '1px solid rgba(0, 245, 255, 0.15)',
      background: 'rgba(5, 5, 16, 0.9)',
      backdropFilter: 'blur(12px)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <div style={{
        maxWidth: '900px',
        margin: '0 auto',
        padding: '0.75rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.65rem',
              fontWeight: 900,
              letterSpacing: '0.15em',
              color: 'var(--cyan)',
              textShadow: '0 0 12px rgba(0, 245, 255, 0.6)',
            }}>ARCADE</span>
            <span style={{
              width: '1px',
              height: '14px',
              background: 'var(--muted)',
              display: 'inline-block',
            }} />
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.65rem',
              fontWeight: 400,
              letterSpacing: '0.15em',
              color: 'var(--muted)',
            }}>QUEUE</span>
          </div>
        </Link>

        {loading ? (
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--surface)' }} />
        ) : user ? (
          <div className="flex items-center gap-3">
            <img
              src={user.avatar}
              alt={user.globalName}
              className="avatar"
              style={{ width: '32px', height: '32px' }}
            />
            <span style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.9rem',
              color: 'var(--white)',
              fontWeight: 600,
            }}>
              {user.globalName}
            </span>
            <button className="btn btn-ghost" style={{ padding: '0.4rem 0.9rem', fontSize: '0.6rem' }} onClick={logout}>
              Logout
            </button>
          </div>
        ) : (
          <button className="btn btn-cyan" onClick={login}>
            <svg width="16" height="12" viewBox="0 0 71 55" fill="none">
              <path d="M60.1 4.9A58.6 58.6 0 0 0 45.5.8a40.9 40.9 0 0 0-1.8 3.7 54.2 54.2 0 0 0-16.3 0A40.6 40.6 0 0 0 25.6.8 58.5 58.5 0 0 0 11 4.9C1.6 19 -.98 32.7.31 46.2a59 59 0 0 0 18 9.1 44.7 44.7 0 0 0 3.9-6.3 38.4 38.4 0 0 1-6.1-2.9c.5-.37 1-.74 1.5-1.1a42 42 0 0 0 35.8 0c.5.38.99.76 1.5 1.1a38.4 38.4 0 0 1-6.1 2.9 44.7 44.7 0 0 0 3.9 6.3 58.8 58.8 0 0 0 18-9.1C71 30.4 67.6 16.8 60.1 4.9ZM23.7 38c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.2 6.4 7.2c0 4-2.8 7.2-6.4 7.2Zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.2 6.4 7.2c0 4-2.8 7.2-6.4 7.2Z" fill="currentColor"/>
            </svg>
            Login with Discord
          </button>
        )}
      </div>
    </header>
  );
}
