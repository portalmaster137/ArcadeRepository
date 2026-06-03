import { useState } from 'react';
import { api } from '../lib/api';
import { useToast } from './Toast';

export default function PlayerControls({ gameId, userQueueEntry, queue, playersPerSlot = 1, onUpdate }) {
  const [loading, setLoading] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const toast = useToast();

  // Find the caller's slot in the queue (may be a duet slot with them as a member).
  const mySlotIndex = userQueueEntry
    ? queue.findIndex(s => s.id === userQueueEntry.id)
    : -1;
  const mySlot = mySlotIndex >= 0 ? queue[mySlotIndex] : userQueueEntry;

  // "Current player" = the caller's userId appears in the head slot's members.
  const isFirst = !!mySlot && mySlotIndex === 0;
  const myStatus = mySlot?.status;

  // A slot is "ready" once it has all its seats filled. A solo-on-duet slot
  // (mode: 'solo') is ready with just one member — the second seat is intentionally empty.
  const slotIsFull = !!mySlot
    && (mySlot.members?.length || 0) >= playersPerSlot;
  const slotIsReady = mySlot?.mode === 'solo' || slotIsFull;
  const canStartGame = isFirst && slotIsReady;

  // Open invite seat: caller is in a duet slot that has fewer than playersPerSlot
  // members AND an invite token (meaning they chose "pair with a specific person").
  const hasOpenInviteSeat = !!mySlot
    && mySlot.inviteToken
    && (mySlot.members?.length || 0) < playersPerSlot;

  async function handle(action) {
    setLoading(true);
    try {
      switch (action) {
        case 'started':
          await api.updateStatus(gameId, 'playing');
          toast("Let's go! Have fun!", 'success');
          break;
        case 'finishing':
          await api.updateStatus(gameId, 'finishing');
          toast('Heads up sent to next player!', 'info');
          break;
        case 'done':
          await api.markDone(gameId);
          toast('Thanks for playing! See you next time.', 'success');
          break;
        case 'leave':
          await api.leaveQueue(gameId);
          toast('Left the queue.', 'info');
          break;
      }
      onUpdate?.();
    } catch (err) {
      toast(err.message || 'Something went wrong', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function copyInviteLink() {
    if (!mySlot?.inviteToken) return;
    const link = `${window.location.origin}/queue/${gameId}?invite=${mySlot.inviteToken}`;
    navigator.clipboard.writeText(link);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  }

  if (!mySlot) return null;

  // The next slot in queue is what the "current player" sees as "up next".
  const nextSlot = queue[mySlotIndex + 1] || null;
  const nextPlayer = nextSlot?.members?.[0] || null;
  const nextPartner = nextSlot?.members?.[1] || null;
  // A next-slot can be a full duet (2 members), a half-filled open/invite duet
  // (1 member still waiting), or a solo-on-duet slot (1 member, ready to play).
  const isNextDuet = (nextSlot?.members?.length || 0) > 1;
  const isNextSoloReady = nextSlot?.mode === 'solo';

  return (
    <div className="card card-accent-cyan" style={{ marginTop: '1.5rem' }}>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: '0.6rem',
        letterSpacing: '0.15em',
        color: 'var(--cyan)',
        marginBottom: '1rem',
      }}>
        YOUR CONTROLS
      </div>

      {hasOpenInviteSeat && (
        <div style={{
          padding: '0.75rem 1rem',
          background: 'rgba(0,245,255,0.06)',
          borderRadius: '4px',
          border: '1px solid rgba(0,245,255,0.25)',
          marginBottom: '0.75rem',
        }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.55rem',
            color: 'var(--cyan)',
            letterSpacing: '0.15em',
            marginBottom: '0.4rem',
          }}>
            WAITING FOR YOUR PARTNER
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
            Share this link with the friend you want to play with. They'll join your slot.
          </p>
          <button
            className="btn btn-cyan w-full"
            style={{ justifyContent: 'center' }}
            onClick={copyInviteLink}
          >
            {copiedInvite ? '✓ Invite link copied!' : 'Copy Invite Link'}
          </button>
        </div>
      )}

      {canStartGame ? (
        <div>
          {/* ── Current player UI ── */}
          {myStatus === 'waiting' && (
            <div>
              <p style={{ color: 'var(--white)', fontWeight: 600, marginBottom: '1rem' }}>
                It's your turn! Approach the cabinet and press start.
              </p>
              <button
                className="btn btn-solid-cyan pulse-cyan w-full"
                style={{ justifyContent: 'center', width: '100%' }}
                onClick={() => handle('started')}
                disabled={loading}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                I've Started!
              </button>
            </div>
          )}

          {myStatus === 'playing' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                background: 'rgba(0,245,255,0.06)',
                borderRadius: '4px',
                border: '1px solid rgba(0,245,255,0.15)',
              }}>
                <span style={{ color: 'var(--cyan)', fontSize: '1.5rem' }}>🎮</span>
                <span style={{ fontWeight: 600 }}>You're playing now — enjoy!</span>
              </div>

              {nextPlayer && (
                <div style={{
                  fontSize: '0.85rem',
                  color: 'var(--muted)',
                  marginBottom: '0.5rem',
                }}>
                  <strong style={{ color: 'var(--yellow)' }}>{nextPlayer.globalName}</strong>
                  {isNextDuet && nextPartner && (
                    <> & <strong style={{ color: 'var(--yellow)' }}>{nextPartner.globalName}</strong></>
                  )}{' '}
                  {isNextSoloReady ? 'is up next (playing solo).' : (isNextDuet ? 'are' : 'is') + ' waiting next.'}
                  {' '}Let {isNextDuet ? 'them' : 'them'} know you're wrapping up.
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {nextPlayer && (
                  <button
                    className="btn btn-yellow"
                    style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => handle('finishing')}
                    disabled={loading}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
                    Almost Done!
                  </button>
                )}
                <button
                  className="btn btn-solid-pink"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => handle('done')}
                  disabled={loading}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  I'm Done
                </button>
              </div>
            </div>
          )}

          {myStatus === 'finishing' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                background: 'rgba(255,230,0,0.06)',
                borderRadius: '4px',
                border: '1px solid rgba(255,230,0,0.25)',
              }}>
                <span style={{ fontSize: '1.4rem' }}>⚡</span>
                <span style={{ fontWeight: 600, color: 'var(--yellow)' }}>
                  Wrapping up — next player has been notified!
                </span>
              </div>
              <button
                className="btn btn-solid-pink"
                style={{ justifyContent: 'center' }}
                onClick={() => handle('done')}
                disabled={loading}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                I'm Done — Next Player!
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{
            padding: '0.75rem 1rem',
            background: 'rgba(180,79,255,0.06)',
            borderRadius: '4px',
            border: '1px solid rgba(180,79,255,0.2)',
          }}>
            <div style={{ fontWeight: 600, color: 'var(--white)', marginBottom: '0.25rem' }}>
              You're #{mySlotIndex + 1} in the queue
            </div>
            {queue[0]?.status === 'finishing' ? (
              <div style={{ fontSize: '0.85rem', color: 'var(--yellow)', fontWeight: 600 }}>
                ⚡ Current player is almost done — get ready!
              </div>
            ) : (
              <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                Hang tight, we'll show an alert when it's almost your turn.
              </div>
            )}
          </div>

          <button
            className="btn btn-ghost"
            style={{ justifyContent: 'center' }}
            onClick={() => handle('leave')}
            disabled={loading}
          >
            Leave Queue
          </button>
        </div>
      )}
    </div>
  );
}
