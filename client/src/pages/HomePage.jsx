import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import QRCode from '../components/QRCode';

const QUEUE_URL = `${window.location.origin}/queue/sound-voltex`;

export default function HomePage() {
  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(QUEUE_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main style={{ flex: 1, maxWidth: '720px', margin: '0 auto', padding: '3rem 1.5rem', width: '100%' }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.65rem',
          letterSpacing: '0.25em',
          color: 'var(--pink)',
          marginBottom: '1rem',
        }}>
          ARCADE QUEUE SYSTEM
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 900,
          fontSize: 'clamp(2rem, 8vw, 3.5rem)',
          lineHeight: 1,
          marginBottom: '1rem',
          letterSpacing: '0.03em',
        }}>
          <span className="neon-cyan">NO MORE</span>
          <br />
          <span style={{ color: 'var(--white)' }}>CROWDING</span>
          <br />
          <span className="neon-pink">THE CAB</span>
        </h1>
        <p style={{ color: 'var(--muted)', maxWidth: '360px', margin: '0 auto', lineHeight: 1.7 }}>
          Scan the QR code at the cabinet to join the queue. You'll get notified when your turn is coming up.
        </p>
      </div>

      {/* QR Card */}
      <div className="card card-accent-cyan" style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.6rem',
          letterSpacing: '0.2em',
          color: 'var(--muted)',
          marginBottom: '0.5rem',
        }}>
          CABINET 1 · MAIN FLOOR
        </div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.4rem',
          fontWeight: 900,
          color: 'var(--cyan)',
          textShadow: '0 0 16px rgba(0,245,255,0.4)',
          marginBottom: '1.5rem',
          letterSpacing: '0.05em',
        }}>
          SOUND VOLTEX
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <QRCode value={QUEUE_URL} size={180} />
        </div>

        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.55rem',
          letterSpacing: '0.1em',
          color: 'var(--muted)',
          marginBottom: '1rem',
        }}>
          SCAN TO JOIN QUEUE
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/queue/sound-voltex" className="btn btn-solid-cyan" style={{ textDecoration: 'none' }}>
            Open Queue
          </Link>
          <button className="btn btn-ghost" onClick={copyLink}>
            {copied ? '✓ Copied!' : 'Copy Link'}
          </button>
        </div>
      </div>

      {/* How it works */}
      <div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.6rem',
          letterSpacing: '0.2em',
          color: 'var(--muted)',
          marginBottom: '1.5rem',
          textAlign: 'center',
        }}>
          HOW IT WORKS
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
          {[
            { icon: '📱', title: 'Scan', desc: 'Scan the QR code at the cabinet with your phone' },
            { icon: '🎮', title: 'Queue Up', desc: 'Log in with Discord and join the queue in one tap' },
            { icon: '⚡', title: 'Get Notified', desc: "When you're up next, you'll see a live alert" },
            { icon: '🏆', title: 'Play', desc: 'Press "I\'ve Started!" and enjoy your game!' },
          ].map((step, i) => (
            <div key={i} style={{
              background: 'var(--surface)',
              border: '1px solid rgba(0,245,255,0.1)',
              borderRadius: '8px',
              padding: '1.25rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>{step.icon}</div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.65rem',
                fontWeight: 700,
                color: 'var(--cyan)',
                letterSpacing: '0.1em',
                marginBottom: '0.4rem',
              }}>
                {step.title.toUpperCase()}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.5 }}>{step.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
