import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';

// 20 × 20 = 400 combinations. Collisions are fine — the user can edit before
// submitting. Kept short and punchy to fit the neon-arcade theme.
const ADJ = [
  'Crimson', 'Neon', 'Pixel', 'Shadow', 'Electric', 'Cosmic', 'Glitchy',
  'Stellar', 'Frosty', 'Arcade', 'Binary', 'Turbo', 'Retro', 'Lucky',
  'Phantom', 'Velvet', 'Midnight', 'Solar', 'Lunar', 'Quantum',
];
const NOUN = [
  'Fox', 'Viper', 'Hawk', 'Wolf', 'Lynx', 'Otter', 'Panda', 'Falcon',
  'Tiger', 'Raven', 'Cobra', 'Mantis', 'Dragon', 'Phoenix', 'Gecko',
  'Raccoon', 'Stallion', 'Cougar', 'Jaguar', 'Bison',
];

function randomName() {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  const n = NOUN[Math.floor(Math.random() * NOUN.length)];
  return `${a}${n}`;
}

// Modal that lets a visitor join the queue without a Discord login.
// Picks a random adjective+noun name on each open; the user can edit it
// before clicking "Play". The Discord option is still available as a fallback.
//
// Props:
//   open:    boolean — controls visibility
//   intent:  'join' | 'invite' — adjusts the title copy
//   onClose: () => void — invoked on Cancel / backdrop click
//   onJoined: (user) => void — invoked after a successful guest login.
//            The parent uses this to drive the next action (join queue, or
//            the consume-invite effect re-fires because `user` changed).
export default function GuestModal({ open, intent = 'join', onClose, onJoined }) {
  const { loginAsGuest } = useAuth();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  // Re-roll a fresh random name and focus the input each time the modal opens.
  useEffect(() => {
    if (open) {
      setName(randomName());
      setError(null);
      setSubmitting(false);
      // Defer to the next tick so the input is mounted before select() runs.
      const t = setTimeout(() => inputRef.current?.select(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!open) return null;

  async function handlePlay() {
    setSubmitting(true);
    setError(null);
    try {
      const user = await loginAsGuest(name);
      onJoined(user);
    } catch (err) {
      setError(err.message || 'Could not create guest session.');
      setSubmitting(false);
    }
  }

  function handleBackdropClick(e) {
    // Only close if the user actually clicked the backdrop, not the card.
    if (e.target === e.currentTarget && !submitting) onClose();
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handlePlay();
    if (e.key === 'Escape' && !submitting) onClose();
  }

  const title = intent === 'invite' ? 'Join your friend' : 'Pick a name to play';
  const subtitle = intent === 'invite'
    ? 'No account needed — just choose a name to take the second seat.'
    : 'No account needed. Edit the name or roll with it.';

  return (
    <div
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: '1rem',
      }}
    >
      <div
        className="card card-accent-cyan"
        style={{
          width: '100%',
          maxWidth: '420px',
          padding: '1.75rem',
          boxShadow: '0 0 32px rgba(0, 245, 255, 0.25)',
        }}
      >
        <h2
          id="guest-modal-title"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.1rem',
            fontWeight: 900,
            color: 'var(--cyan)',
            textShadow: '0 0 12px rgba(0, 245, 255, 0.5)',
            letterSpacing: '0.1em',
            textAlign: 'center',
            marginBottom: '0.5rem',
          }}
        >
          {title}
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            color: 'var(--muted)',
            textAlign: 'center',
            marginBottom: '1.25rem',
          }}
        >
          {subtitle}
        </p>

        <label
          htmlFor="guest-modal-name"
          style={{
            display: 'block',
            fontFamily: 'var(--font-display)',
            fontSize: '0.55rem',
            letterSpacing: '0.15em',
            color: 'var(--muted)',
            marginBottom: '0.4rem',
          }}
        >
          DISPLAY NAME
        </label>
        <input
          id="guest-modal-name"
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={32}
          disabled={submitting}
          autoFocus
          style={{
            width: '100%',
            fontFamily: 'var(--font-body)',
            fontSize: '1.1rem',
            fontWeight: 600,
            color: 'var(--white)',
            background: 'var(--bg3)',
            border: '1px solid var(--cyan-dim)',
            borderRadius: 'var(--radius)',
            padding: '0.7rem 0.9rem',
            outline: 'none',
            marginBottom: '0.5rem',
          }}
          onFocus={(e) => { e.target.style.borderColor = 'var(--cyan)'; }}
          onBlur={(e) => { e.target.style.borderColor = 'var(--cyan-dim)'; }}
        />
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.5rem',
            letterSpacing: '0.1em',
            color: 'var(--muted)',
            textAlign: 'right',
            marginBottom: '1rem',
          }}
        >
          {name.length}/32
        </div>

        {error && (
          <div
            style={{
              fontSize: '0.8rem',
              color: 'var(--pink)',
              textAlign: 'center',
              marginBottom: '0.75rem',
            }}
          >
            {error}
          </div>
        )}

        <button
          className="btn btn-solid-cyan"
          style={{ width: '100%', justifyContent: 'center', padding: '0.9rem' }}
          onClick={handlePlay}
          disabled={submitting || name.trim().length === 0}
        >
          {submitting ? 'Joining…' : 'Play'}
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            margin: '1rem 0',
            color: 'var(--muted)',
            fontSize: '0.7rem',
            fontFamily: 'var(--font-display)',
            letterSpacing: '0.1em',
          }}
        >
          <div style={{ flex: 1, height: '1px', background: 'var(--muted)', opacity: 0.3 }} />
          <span>OR</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--muted)', opacity: 0.3 }} />
        </div>

        <a
          href={`${import.meta.env.VITE_API_URL}/auth/discord`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            width: '100%',
            padding: '0.7rem',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--muted)',
            color: 'var(--muted)',
            textDecoration: 'none',
            fontFamily: 'var(--font-display)',
            fontSize: '0.65rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          <svg width="16" height="12" viewBox="0 0 71 55" fill="currentColor">
            <path d="M60.1 4.9A58.6 58.6 0 0 0 45.5.8a40.9 40.9 0 0 0-1.8 3.7 54.2 54.2 0 0 0-16.3 0A40.6 40.6 0 0 0 25.6.8 58.5 58.5 0 0 0 11 4.9C1.6 19-.98 32.7.31 46.2a59 59 0 0 0 18 9.1 44.7 44.7 0 0 0 3.9-6.3 38.4 38.4 0 0 1-6.1-2.9c.5-.37 1-.74 1.5-1.1a42 42 0 0 0 35.8 0c.5.38.99.76 1.5 1.1a38.4 38.4 0 0 1-6.1 2.9 44.7 44.7 0 0 0 3.9 6.3 58.8 58.8 0 0 0 18-9.1C71 30.4 67.6 16.8 60.1 4.9ZM23.7 38c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.2 6.4 7.2c0 4-2.8 7.2-6.4 7.2Zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.2 6.4 7.2c0 4-2.8 7.2-6.4 7.2Z" />
          </svg>
          Log in with Discord
        </a>

        <button
          className="btn btn-ghost"
          style={{ width: '100%', justifyContent: 'center', marginTop: '0.75rem', padding: '0.6rem' }}
          onClick={onClose}
          disabled={submitting}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
