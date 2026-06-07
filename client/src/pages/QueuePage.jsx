import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useQueue } from '../hooks/useQueue';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import QueueEntry from '../components/QueueEntry';
import PlayerControls from '../components/PlayerControls';
import ReadyBanner from '../components/ReadyBanner';
import WaitingForPartner from '../components/WaitingForPartner';

// "Finishing soon" alert banner for the next-up player(s)
function FinishingSoonAlert() {
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
            The current group is almost done. Head to the cabinet!
          </div>
        </div>
      </div>
      <button onClick={() => setVisible(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
    </div>
  );
}

// "How are you playing?" prompt shown when playersPerSlot > 1
function FormationPrompt({ onChoose, disabled }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: '0.6rem',
        letterSpacing: '0.15em',
        color: 'var(--muted)',
        marginBottom: '0.75rem',
        textAlign: 'center',
      }}>
        HOW ARE YOU PLAYING?
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <button
          className="btn btn-yellow"
          style={{ justifyContent: 'center', padding: '1rem', flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}
          onClick={() => onChoose('solo')}
          disabled={disabled}
        >
          <span style={{ fontSize: '0.75rem' }}>👤 PLAY SOLO</span>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 500, color: 'rgba(0,0,0,0.7)', textTransform: 'none', letterSpacing: 0 }}>
            Take one of the two seats. The other seat stays empty.
          </span>
        </button>
        <button
          className="btn btn-solid-cyan"
          style={{ justifyContent: 'center', padding: '1rem', flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}
          onClick={() => onChoose('open')}
          disabled={disabled}
        >
          <span style={{ fontSize: '0.75rem' }}>🎲 PAIR WITH ANYONE</span>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 500, color: 'rgba(0,0,0,0.7)', textTransform: 'none', letterSpacing: 0 }}>
            Get matched with the next person who picks this.
          </span>
        </button>
        <button
          className="btn btn-pink"
          style={{ justifyContent: 'center', padding: '1rem', flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}
          onClick={() => onChoose('invite')}
          disabled={disabled}
        >
          <span style={{ fontSize: '0.75rem' }}>👯 PAIR WITH A FRIEND</span>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 500, color: 'rgba(255,255,255,0.7)', textTransform: 'none', letterSpacing: 0 }}>
            We'll give you a link to share with the person you want to play with.
          </span>
        </button>
      </div>
    </div>
  );
}

export default function QueuePage() {
  const { gameId } = useParams();
  const { user, loading: authLoading, login } = useAuth();
  const { queue, game, loading: queueLoading } = useQueue(gameId);
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [joining, setJoining] = useState(false);

  const playersPerSlot = game?.playersPerSlot || 1;
  const isDuetGame = playersPerSlot > 1;

  // Find the caller's slot (by membership, not top-level userId) — and its index.
  const userEntry = useMemo(() => {
    if (!user) return null;
    return queue.find(s => (s.members || []).some(m => m.userId === user.id)) || null;
  }, [user, queue]);

  const userSlotIndex = userEntry
    ? queue.findIndex(s => s.id === userEntry.id)
    : -1;

  // "User is up next" = they are a member of the slot at index 1.
  // For duets, this fires for both members of that slot.
  const isUserNext = userEntry && userSlotIndex === 1;
  const currentPlayerFinishing = queue[0]?.status === 'finishing';

  // Head-slot readiness banner: show only when the current user is a member
  // of the head slot AND the slot has an active readyDeadline. The slot's
  // `readyDeadline` is null once the user confirms (status: 'playing') or
  // for non-head slots, so this naturally hides itself in those cases.
  const headSlot = queue[0] || null;
  const isHeadMember = !!user && !!headSlot
    && (headSlot.members || []).some(m => m.userId === user.id);
  const showReadyBanner = isHeadMember
    && !!headSlot?.readyDeadline
    && headSlot?.status !== 'playing';

  // "Waiting for partner" banner: shown only when the user is the sole member
  // of a half-filled duet head slot. By the server's slotIsPlayable contract,
  // such a slot has no readyDeadline, so this is mutually exclusive with
  // showReadyBanner — a slot matches one or the other, never both.
  const isHalfFilledDuetHead = isHeadMember
    && headSlot?.mode === 'duet'
    && (headSlot?.members?.length || 0) < playersPerSlot;
  const showWaitingBanner = isHalfFilledDuetHead;

  // Est-wait: number of slots ahead of (and including) the next-to-play slot.
  // Solo: queue.length slots. Duet: ceil(queue.length / playersPerSlot) slots.
  const estWait = queue.length === 0
    ? null
    : Math.ceil(queue.length / playersPerSlot) * 5;

  // ── Auto-consume invite token on first load ──
  useEffect(() => {
    if (authLoading || !user || !game) return;
    const token = searchParams.get('invite');
    if (!token || userEntry) {
      // Either no invite, or already queued — clear the query param.
      if (token) {
        const next = new URLSearchParams(searchParams);
        next.delete('invite');
        setSearchParams(next, { replace: true });
      }
      return;
    }
    // Attempt to join with the invite.
    (async () => {
      setJoining(true);
      try {
        await api.joinQueue(gameId, { inviteToken: token });
        toast('Joined your friend\'s slot!', 'success');
        const next = new URLSearchParams(searchParams);
        next.delete('invite');
        setSearchParams(next, { replace: true });
      } catch (err) {
        const msg = err.status === 400
          ? 'This invite link is invalid or has expired.'
          : (err.message || 'Could not join with invite');
        toast(msg, 'error');
        const next = new URLSearchParams(searchParams);
        next.delete('invite');
        setSearchParams(next, { replace: true });
      } finally {
        setJoining(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, game, userEntry?.id]);

  async function joinQueue(formation = 'open') {
    if (!user) return login();
    setJoining(true);
    try {
      await api.joinQueue(gameId, { formation });
      const msg = formation === 'invite'
        ? 'Slot held — share the invite link below.'
        : formation === 'solo'
          ? 'Slot reserved for solo play. Approach the cabinet when it\'s your turn!'
          : 'Joined the queue!';
      toast(msg, 'success');
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

  // ── Lazy-void keepalive ──
  // Hit the server's GET /api/tick every 30s so any head whose readiness
  // deadline has passed is auto-voided, even when no one is interacting
  // with the page. The server's getHeadSlotLive is what does the work; this
  // is just the trigger. Mount cleanup clears the interval.
  useEffect(() => {
    const id = setInterval(() => {
      api.tick().catch((err) => {
        // Log but don't surface to the user — the lazy-void is best-effort
        // and the next user action on the head will catch a missed deadline
        // via getHeadSlotLive inside the queue routes.
        console.warn('tick keepalive failed', err);
      });
    }, 30000);
    return () => clearInterval(id);
  }, []);

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
          {[
            game.cabinetNumber != null && `CABINET ${game.cabinetNumber}`,
            game.location,
            isDuetGame && `DUET (${playersPerSlot}P/SLOT)`,
          ].filter(Boolean).join(' · ')}
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

      {/* "Waiting for partner" banner: shown for the lone member of a
          half-filled duet head slot. Takes precedence over ReadyBanner (which
          is the playable-slot 60s window). */}
      {showWaitingBanner && (
        <WaitingForPartner slot={headSlot} />
      )}

      {/* Head-of-queue readiness banner (60s window, optional +2min extension) */}
      {showReadyBanner && (
        <ReadyBanner slot={headSlot} gameId={gameId} />
      )}

      {/* Alert for next-up group when current is finishing */}
      {isUserNext && currentPlayerFinishing && <FinishingSoonAlert />}

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
            {isDuetGame ? 'PLAYERS' : 'IN QUEUE'}
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
            {estWait == null ? '—' : `~${estWait}m`}
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
                key={entry.id}
                entry={entry}
                position={i + 1}
                isCurrentUser={!!userEntry && entry.id === userEntry.id}
                isFirst={i === 0}
              />
            ))}
          </div>
        )}
      </div>

      {/* Join flow or player controls */}
      {userEntry ? (
        <PlayerControls
          gameId={gameId}
          userQueueEntry={userEntry}
          queue={queue}
          playersPerSlot={playersPerSlot}
        />
      ) : isDuetGame ? (
        <div>
          <FormationPrompt onChoose={joinQueue} disabled={joining} />
          {!user && (
            <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.75rem' }}>
              You'll be asked to log in with Discord
            </p>
          )}
        </div>
      ) : (
        <div>
          <button
            className={`btn ${queue.length === 0 ? 'btn-solid-cyan pulse-cyan' : 'btn-cyan'}`}
            style={{ width: '100%', justifyContent: 'center', padding: '1rem' }}
            onClick={() => joinQueue('open')}
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
