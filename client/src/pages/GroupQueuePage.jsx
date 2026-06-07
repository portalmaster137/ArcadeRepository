import { useParams } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import { doc, collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import QueueEntry from '../components/QueueEntry';
import PlayerControls from '../components/PlayerControls';
import ReadyBanner from '../components/ReadyBanner';
import WaitingForPartner from '../components/WaitingForPartner';

function CabinetSection({ game, user, userSlotId, onJoin, onLeave, joining, onUpdate }) {
  const queue = game.queue;
  const isDuet = (game.playersPerSlot || 1) > 1;
  const userEntry = user
    ? queue.find(s => (s.members || []).some(m => m.userId === user.id))
    : null;
  const isCurrentUserInThisCab = userSlotId === game.id;

  // Head-of-queue readiness banner: scoped to the cabinet the user is on,
  // shown only when they're a member of its head slot with an active deadline.
  const headSlot = queue[0] || null;
  const isHeadMember = isCurrentUserInThisCab
    && !!user
    && (headSlot?.members || []).some(m => m.userId === user.id);
  const showReadyBanner = isHeadMember
    && !!headSlot?.readyDeadline
    && headSlot?.status !== 'playing';

  // "Waiting for partner" banner: scoped to this cabinet, shown only when the
  // user is the lone member of a half-filled duet head slot. Mutually
  // exclusive with showReadyBanner (a slot has a readyDeadline IFF it is
  // playable, and this is the inverse).
  const cabinetPlayersPerSlot = game.playersPerSlot || 1;
  const isHalfFilledDuetHead = isHeadMember
    && headSlot?.mode === 'duet'
    && (headSlot?.members?.length || 0) < cabinetPlayersPerSlot;
  const showWaitingBanner = isHalfFilledDuetHead;

  return (
    <section style={{ marginBottom: '2rem' }}>
      {/* "Waiting for partner" banner: lone member of a half-filled duet
          head slot on THIS cabinet. */}
      {showWaitingBanner && (
        <WaitingForPartner slot={headSlot} />
      )}
      {/* Head-of-queue readiness banner for THIS cabinet */}
      {showReadyBanner && (
        <ReadyBanner slot={headSlot} gameId={game.id} />
      )}
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: '0.6rem',
        letterSpacing: '0.2em',
        color: 'var(--muted)',
        marginBottom: '0.4rem',
      }}>
        {game.cabinetNumber != null && `CABINET ${game.cabinetNumber}`}
        {game.cabinetNumber != null && game.location && ' · '}
        {game.location}
      </div>
      <h2 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 'clamp(1.2rem, 4vw, 1.6rem)',
        fontWeight: 900,
        color: 'var(--cyan)',
        textShadow: '0 0 16px rgba(0, 245, 255, 0.3)',
        letterSpacing: '0.05em',
        marginBottom: '0.5rem',
        lineHeight: 1.1,
      }}>
        {game.name}
      </h2>
      {game.subtitle && (
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.6rem',
          color: 'var(--pink)',
          letterSpacing: '0.12em',
          marginBottom: '1rem',
        }}>
          {game.subtitle}
        </div>
      )}

      {/* Cabinet stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0.5rem',
        marginBottom: '1rem',
      }}>
        <div style={{
          background: 'var(--surface)',
          border: '1px solid rgba(0,245,255,0.12)',
          borderRadius: '6px',
          padding: '0.75rem',
          textAlign: 'center',
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 900, color: queue.length === 0 ? 'var(--cyan)' : 'var(--white)' }}>
            {queue.length}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.5rem', color: 'var(--muted)', letterSpacing: '0.1em' }}>
            {isDuet ? 'PLAYERS' : 'IN QUEUE'}
          </div>
        </div>
        <div style={{
          background: 'var(--surface)',
          border: '1px solid rgba(0,245,255,0.12)',
          borderRadius: '6px',
          padding: '0.75rem',
          textAlign: 'center',
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 900, color: queue.length === 0 ? 'var(--cyan)' : 'var(--yellow)' }}>
            {queue.length === 0 ? '—' : `~${Math.ceil(queue.length / (game.playersPerSlot || 1)) * 5}m`}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.5rem', color: 'var(--muted)', letterSpacing: '0.1em' }}>
            EST. WAIT
          </div>
        </div>
      </div>

      {/* Cabinet queue list */}
      {queue.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '1.5rem 1rem',
          border: '1px dashed rgba(0,245,255,0.2)',
          borderRadius: '8px',
          color: 'var(--muted)',
          fontSize: '0.85rem',
        }}>
          Cabinet is free.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
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

      {/* If the user is on THIS cabinet, show controls; otherwise show a join button */}
      {isCurrentUserInThisCab && userEntry && (
        <PlayerControls
          gameId={game.id}
          userQueueEntry={userEntry}
          queue={queue}
          playersPerSlot={game.playersPerSlot || 1}
          onUpdate={onUpdate}
        />
      )}
    </section>
  );
}

export default function GroupQueuePage() {
  const { groupId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const [joining, setJoining] = useState(false);

  const [group, setGroup] = useState(null);
  const [groupLoading, setGroupLoading] = useState(true);

  // Subscribe to the group doc
  useEffect(() => {
    if (!groupId) return;
    const unsub = onSnapshot(doc(db, 'cabinetGroups', groupId), (snap) => {
      if (snap.exists()) setGroup({ id: snap.id, ...snap.data() });
      setGroupLoading(false);
    });
    return unsub;
  }, [groupId]);

  // Subscribe to all games referenced by the group, plus each game's queue.
  const [gamesState, setGamesState] = useState({});
  useEffect(() => {
    if (!group) return;
    const gameIds = group.gameIds || [];
    const unsubs = [];
    for (const gid of gameIds) {
      const gUnsub = onSnapshot(doc(db, 'games', gid), (snap) => {
        setGamesState(prev => {
          const existing = prev[gid] || { queue: [], queueLoading: true };
          return { ...prev, [gid]: { ...existing, game: snap.exists() ? { id: snap.id, ...snap.data() } : null } };
        });
      });
      const qUnsub = onSnapshot(
        query(collection(db, 'games', gid, 'queue'), orderBy('joinedAt', 'asc')),
        (snap) => {
          setGamesState(prev => {
            const existing = prev[gid] || { game: null };
            return { ...prev, [gid]: { ...existing, queue: snap.docs.map(d => ({ id: d.id, ...d.data() })), queueLoading: false } };
          });
        }
      );
      unsubs.push(gUnsub, qUnsub);
    }
    return () => unsubs.forEach(u => u());
  }, [group]);

  // ── Lazy-void keepalive ──
  // Hit the server's GET /api/tick every 30s so any head whose readiness
  // deadline has passed is auto-voided across all cabinets in this group.
  // The server's getHeadSlotLive is what does the work; this is just the
  // trigger. Mount cleanup clears the interval.
  useEffect(() => {
    const id = setInterval(() => {
      api.tick().catch((err) => {
        console.warn('tick keepalive failed', err);
      });
    }, 30000);
    return () => clearInterval(id);
  }, []);

  // Find which cabinet (if any) the user is queued on.
  const userSlotId = useMemo(() => {
    if (!user) return null;
    for (const [gid, state] of Object.entries(gamesState)) {
      if ((state.queue || []).some(s => (s.members || []).some(m => m.userId === user.id))) {
        return gid;
      }
    }
    return null;
  }, [user, gamesState]);

  async function joinCabinet(gameId, formation) {
    if (!user) {
      window.location.href = `${import.meta.env.VITE_API_URL}/auth/discord`;
      return;
    }
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

  if (authLoading || groupLoading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
        <div className="spinner" />
        <p className="text-muted" style={{ fontFamily: 'var(--font-display)', fontSize: '0.6rem', letterSpacing: '0.15em' }}>LOADING</p>
      </div>
    );
  }

  if (!group) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', padding: '2rem' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--pink)' }}>404</div>
        <p style={{ color: 'var(--muted)', textAlign: 'center' }}>Cabinet group not found.</p>
      </div>
    );
  }

  const gameIds = group.gameIds || [];

  return (
    <main style={{ flex: 1, maxWidth: '620px', margin: '0 auto', padding: '2rem 1.5rem', width: '100%' }}>
      {/* Group header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.6rem',
          letterSpacing: '0.2em',
          color: 'var(--muted)',
          marginBottom: '0.4rem',
        }}>
          {group.location}
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
          {group.name}
        </h1>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.65rem',
          color: 'var(--pink)',
          letterSpacing: '0.12em',
          marginTop: '0.4rem',
        }}>
          {gameIds.length} CABINET{gameIds.length === 1 ? '' : 'S'} · DUET
        </div>
      </div>

      {/* Per-cabinet sections */}
      {gameIds.map(gid => {
        const state = gamesState[gid];
        if (!state?.game) return null;
        return (
          <CabinetSection
            key={gid}
            game={{ ...state.game, queue: state.queue || [] }}
            user={user}
            userSlotId={userSlotId}
            joining={joining}
            onJoin={joinCabinet}
            onLeave={() => api.leaveQueue(gid)}
            onUpdate={() => {}}
          />
        );
      })}

      {/* If the user is on neither cabinet, show join buttons for each */}
      {!userSlotId && gameIds.length > 0 && (
        <div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.6rem',
            letterSpacing: '0.15em',
            color: 'var(--muted)',
            marginBottom: '0.75rem',
            textAlign: 'center',
          }}>
            PICK A CABINET TO JOIN
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {gameIds.map(gid => {
              const state = gamesState[gid];
              if (!state?.game) return null;
              const isDuet = (state.game.playersPerSlot || 1) > 1;
              const cabinetLabel = `CABINET ${state.game.cabinetNumber}`;
              return (
                <div key={gid} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.6rem',
                    letterSpacing: '0.15em',
                    color: 'var(--muted)',
                    textAlign: 'center',
                  }}>
                    {cabinetLabel}
                  </div>
                  {isDuet && (
                    <button
                      className="btn btn-yellow"
                      style={{ justifyContent: 'center' }}
                      onClick={() => joinCabinet(gid, 'solo')}
                      disabled={joining}
                    >
                      👤 Play Solo
                    </button>
                  )}
                  <button
                    className="btn btn-cyan"
                    style={{ justifyContent: 'center' }}
                    onClick={() => joinCabinet(gid, 'open')}
                    disabled={joining}
                  >
                    🎲 Pair With Anyone
                  </button>
                  {isDuet && (
                    <button
                      className="btn btn-pink"
                      style={{ justifyContent: 'center' }}
                      onClick={() => joinCabinet(gid, 'invite')}
                      disabled={joining}
                    >
                      👯 Pair With A Friend
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {!user && (
            <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.75rem' }}>
              You'll be asked to log in with Discord
            </p>
          )}
        </div>
      )}
    </main>
  );
}
