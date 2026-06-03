import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useQueue } from '../hooks/useQueue';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import QueueEntry from '../components/QueueEntry';
import PlayerControls from '../components/PlayerControls';

// "Finishing soon" alert banner for the next-up player
function FinishingSoonAlert({ nextPlayer }) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <div style={{
      background: 'rgba(255,230,0,0.08)',
      border: '1px solid rgba(255,230,0,0.5)',
      borderRadius: '6px',
      padding: '1rem 1.25rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1rem',
      marginBottom: '1rem',
      animation: 'pulse-yellow 2s ease-in-out infinite',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontSize: '1.4rem' }}>⚡</span>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.6rem', color: 'var(--yellow)', letterSpacing: '0.1em', marginBottom: '0.15rem' }}>
            GET READY
          </div>
          <div style={{ fontWeight: 600, color: 'var(--white)' }}>
            The current player is almost done. Head to the cabinet!
          </div>
        </div>
      </div>
      <button onClick={() => setVisible(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
    </div>
  );
}

export default function QueuePage() {
  const { gameId } = useParams();
  const { user, loading: authLoading, login } = useAuth();
  const { queue, game, loading: queueLoading } = useQueue(gameId);
  const toast = useToast();
  const [joining, setJoining] = useState(false);

  const userEntry = user ? queue.find(e => e.userId === user.id) : null;
  const isUserNext = user && queue.length >= 2 && queue[1]?.userId === user.id;
  const currentPlayerFinishing = queue[0]?.status === 'finishing';

  async function joinQueue() {
    if (!user) return login();
    setJoining(true);
    try {
      await api.joinQueue(gameId);
      toast('Joined the queue!', 'success');
    } catch (err) {
      if (err.error === 'already_queued') {
        toast(`You're already queued for ${err.gameName}. Leave that queue first.`, 'error');
      } else {
        toast(err.message || 'Could not join queue', 'error');
      }
    } finally {
      setJoining(false);
    }
  }

  if (authLoading || queueLoading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
        <div className="spinner" />
        <p className="text-muted" style={{ fontFamily: 'var(--font-display)', fontSize: '0.6rem', letterSpacing: '0.15em' }}>LOADING</p>
      </div>
    );
  }

  if (!game) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', padding: '2rem' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--pink)' }}>404</div>
        <p style={{ color: 'var(--muted)', textAlign: 'center' }}>Game not found. Check the QR code and try again.</p>
      </div>
    );
  }

  return (
    <main style={{ flex: 1, maxWidth: '620px', margin: '0 auto', padding: '2rem 1.5rem', width: '100%' }}>
      {/* Game header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.6rem',
          letterSpacing: '0.2em',
          color: 'var(--muted)',
          marginBottom: '0.4rem',
        }}>
          CABINET {game.cabinetNumber} · {game.location}
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(1.6rem, 5vw, 2.4rem)',
          fontWeight: 900,
          color: 'var(--cyan)',
          textShadow: '0 0 24px rgba(0, 245, 255, 0.4)',
          letterSpacing: '0.05em',
          lineHeight: 1.1,
        }}>
          {game.name}
        </h1>
        {game.subtitle && (
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.7rem',
            color: 'var(--pink)',
            letterSpacing: '0.12em',
            marginTop: '0.25rem',
          }}>
            {game.subtitle}
          </div>
        )}
      </div>

      {/* Alert for next-up player when current is finishing */}
      {isUserNext && currentPlayerFinishing && (
        <FinishingSoonAlert />
      )}

      {/* Queue stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0.75rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{
          background: 'var(--surface)',
          border: '1px solid rgba(0,245,255,0.12)',
          borderRadius: '6px',
          padding: '1rem',
          textAlign: 'center',
        }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2rem',
            fontWeight: 900,
            color: queue.length === 0 ? 'var(--cyan)' : 'var(--white)',
          }}>
            {queue.length}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.55rem', color: 'var(--muted)', letterSpacing: '0.1em' }}>
            IN QUEUE
          </div>
        </div>
        <div style={{
          background: 'var(--surface)',
          border: '1px solid rgba(0,245,255,0.12)',
          borderRadius: '6px',
          padding: '1rem',
          textAlign: 'center',
        }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2rem',
            fontWeight: 900,
            color: queue.length === 0 ? 'var(--cyan)' : 'var(--yellow)',
          }}>
            {queue.length === 0 ? '—' : `~${queue.length * 5}m`}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.55rem', color: 'var(--muted)', letterSpacing: '0.1em' }}>
            EST. WAIT
          </div>
        </div>
      </div>

      {/* Queue list */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.6rem',
          letterSpacing: '0.15em',
          color: 'var(--muted)',
          marginBottom: '0.75rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>QUEUE</span>
          {queue.length === 0 && <span style={{ color: 'var(--cyan)' }}>OPEN — NO WAIT</span>}
        </div>

        {queue.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '3rem 1rem',
            border: '1px dashed rgba(0,245,255,0.2)',
            borderRadius: '8px',
            color: 'var(--muted)',
          }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.65rem', letterSpacing: '0.1em', marginBottom: '0.5rem', color: 'var(--cyan)' }}>
              CABINET IS FREE
            </div>
            <div style={{ fontSize: '0.9rem' }}>Be the first to jump in!</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {queue.map((entry, i) => (
              <QueueEntry
                key={entry.userId}
                entry={entry}
                position={i + 1}
                isCurrentUser={user?.id === entry.userId}
                isFirst={i === 0}
              />
            ))}
          </div>
        )}
      </div>

      {/* Join button or player controls */}
      {userEntry ? (
        <PlayerControls
          gameId={gameId}
          userQueueEntry={userEntry}
          queue={queue}
        />
      ) : (
        <div>
          <button
            className={`btn ${queue.length === 0 ? 'btn-solid-cyan pulse-cyan' : 'btn-cyan'}`}
            style={{ width: '100%', justifyContent: 'center', padding: '1rem' }}
            onClick={joinQueue}
            disabled={joining}
          >
            {joining ? 'Joining...' : queue.length === 0 ? '▶ Play Now' : 'Join Queue'}
          </button>
          {!user && (
            <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.75rem' }}>
              You'll be asked to log in with Discord
            </p>
          )}
        </div>
      )}

      <style>{`
        @keyframes pulse-yellow {
          0%, 100% { border-color: rgba(255,230,0,0.3); }
          50% { border-color: rgba(255,230,0,0.7); }
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </main>
  );
}
