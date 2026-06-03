import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from './Toast';

/**
 * Big flashy banner shown only to members of the head slot when there's an
 * active `readyDeadline`. Counts down live, has a "Start now" button to
 * confirm (transitions the slot to 'playing'), and an "I'm on my way — +2 min"
 * button that grants a one-shot 2-minute extension. After the deadline
 * passes the slot is auto-voided by the server; the banner goes away
 * reactively via the parent's onSnapshot subscription.
 *
 * Props:
 *   - slot:           the head slot object (must have a readyDeadline Timestamp or Date)
 *   - gameId:         for the API call
 *   - onConfirm:      optional async () => void — parent hook called after api call succeeds
 *   - onExtend:       optional async () => void — parent hook called after api call succeeds
 */
export default function ReadyBanner({ slot, gameId, onConfirm, onExtend }) {
  const [secondsLeft, setSecondsLeft] = useState(() => computeSecondsLeft(slot?.readyDeadline));
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  // Re-tick the countdown every second. Use setInterval rather than recomputing
  // on every render so the parent queue re-renders (which happen a lot via
  // onSnapshot) don't push extra work here.
  useEffect(() => {
    if (!slot?.readyDeadline) return undefined;
    const id = setInterval(() => {
      const next = computeSecondsLeft(slot.readyDeadline);
      setSecondsLeft(next);
    }, 1000);
    return () => clearInterval(id);
  }, [slot?.readyDeadline]);

  // One-time browser notification when the banner first appears, so a user
  // who has the tab in the background still gets a heads-up. We don't
  // auto-prompt for permission — that'd be intrusive. If they've already
  // granted, fire the notification; otherwise skip silently.
  useEffect(() => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try {
        new Notification("It's your turn! 🎮", {
          body: 'You have 60 seconds to start, or your spot will be voided.',
          tag: 'arcade-queue-ready',
        });
      } catch (err) {
        // Some browsers throw if notifications are disabled at the OS level
        // even when permission is "granted". Swallow.
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!slot?.readyDeadline) return null;

  async function handleConfirm() {
    setBusy(true);
    try {
      await api.confirmReady(gameId);
      toast("Have fun! 🎮", 'success');
      onConfirm?.();
    } catch (err) {
      toast(err.message || "Couldn't confirm — try again", 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleExtend() {
    setBusy(true);
    try {
      await api.extendReady(gameId);
      toast('+2 minutes granted. Hurry over!', 'info');
      onExtend?.();
    } catch (err) {
      if (err?.error === 'extension_already_used') {
        toast('Extension already used for this slot.', 'error');
      } else {
        toast(err.message || "Couldn't extend — try again", 'error');
      }
    } finally {
      setBusy(false);
    }
  }

  // When the countdown hits zero, the slot is about to be auto-voided by the
  // server's setTimeout. We don't need to do anything reactive here — the
  // parent's onSnapshot will deliver the slot-removal event and unmount this
  // banner. The user just sees "time's up" briefly.
  const display = formatTime(secondsLeft);
  const lowTime = secondsLeft <= 10;
  const canExtend = !slot.extensionUsed;

  return (
    <div
      className={lowTime ? 'pulse-pink' : 'pulse-cyan'}
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        padding: '1.25rem 1.5rem',
        marginBottom: '1.5rem',
        background: lowTime
          ? 'linear-gradient(135deg, rgba(255,45,120,0.18), rgba(180,79,255,0.18))'
          : 'linear-gradient(135deg, rgba(0,245,255,0.18), rgba(255,45,120,0.18))',
        border: lowTime
          ? '1px solid rgba(255,45,120,0.5)'
          : '1px solid rgba(0,245,255,0.4)',
        borderRadius: '6px',
        boxShadow: lowTime
          ? '0 0 24px rgba(255,45,120,0.3)'
          : '0 0 24px rgba(0,245,255,0.25)',
        display: 'flex',
        alignItems: 'center',
        gap: '1.5rem',
        flexWrap: 'wrap',
      }}
    >
      {/* Headline + countdown */}
      <div style={{ flex: '1 1 auto', minWidth: '200px' }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.65rem',
            letterSpacing: '0.18em',
            color: 'var(--cyan)',
            marginBottom: '0.4rem',
          }}
        >
          ⚡ IT'S YOUR TURN — APPROACH THE CABINET
        </div>
        <div
          style={{
            fontSize: '2.2rem',
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            color: lowTime ? 'var(--pink)' : 'var(--cyan)',
            textShadow: lowTime
              ? '0 0 14px rgba(255,45,120,0.6)'
              : '0 0 14px rgba(0,245,255,0.5)',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {display}
        </div>
        <div
          style={{
            fontSize: '0.8rem',
            color: 'var(--muted)',
            marginTop: '0.35rem',
          }}
        >
          {lowTime
            ? "Hurry! Your spot will be voided at zero."
            : 'Press start now, or extend once if you need more time.'}
        </div>
      </div>

      {/* Action buttons */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          flex: '0 0 auto',
        }}
      >
        <button
          className="btn btn-solid-cyan"
          style={{ justifyContent: 'center', minWidth: '180px' }}
          onClick={handleConfirm}
          disabled={busy}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3" /></svg>
          Start now
        </button>
        {canExtend ? (
          <button
            className="btn btn-yellow"
            style={{ justifyContent: 'center', minWidth: '180px' }}
            onClick={handleExtend}
            disabled={busy}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            I'm on my way (+2 min)
          </button>
        ) : (
          <div
            style={{
              fontSize: '0.7rem',
              color: 'var(--muted)',
              textAlign: 'center',
              fontStyle: 'italic',
              padding: '0.4rem',
            }}
          >
            Extension already used
          </div>
        )}
      </div>
    </div>
  );
}

// Compute the seconds remaining until `deadline`. `deadline` is a Firestore
// Timestamp in production but may be a Date in tests, so handle both. The
// countdown is a "ceiling" — at 60.4s remaining we show 61, so the user sees
// the full 60 seconds up front rather than dropping from 60 to 59 after 1s.
function computeSecondsLeft(deadline) {
  if (!deadline) return 0;
  const ms = typeof deadline.toMillis === 'function' ? deadline.toMillis() : new Date(deadline).getTime();
  return Math.max(0, Math.ceil((ms - Date.now()) / 1000));
}

function formatTime(seconds) {
  if (seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
