/**
 * Calm, passive banner shown to the lone member of a half-filled duet head
 * slot. The server has not stamped a readyDeadline on a half-filled slot
 * (see slotIsPlayable in server/index.js), so ReadyBanner won't render — this
 * takes its place to communicate that yes, you're at the head, but you're
 * waiting on a partner before the readiness timer starts.
 *
 * No countdown, no animation, no buttons. PlayerControls still renders its
 * own leave-queue button for this case (isFirst && !slotIsFull branch), so
 * the user has the escape hatch without duplicating it here.
 *
 * Props:
 *   - slot: the head slot object (unused for now; kept symmetric with
 *           ReadyBanner for future extensions like "estimated partner wait").
 */
export default function WaitingForPartner({ slot }) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        padding: '1.25rem 1.5rem',
        marginBottom: '1.5rem',
        background: 'linear-gradient(135deg, rgba(0,245,255,0.14), rgba(180,79,255,0.14))',
        border: '1px solid rgba(0,245,255,0.35)',
        borderRadius: '6px',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        boxShadow: '0 0 18px rgba(0,245,255,0.18)',
      }}
    >
      <div style={{ fontSize: '1.5rem' }}>🤝</div>
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.65rem',
            letterSpacing: '0.18em',
            color: 'var(--cyan)',
            marginBottom: '0.35rem',
          }}
        >
          YOU'RE AT THE HEAD
        </div>
        <div style={{ fontWeight: 600, color: 'var(--white)' }}>
          Waiting for 1 more player to fill this duet slot.
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
          The 60-second timer starts once your partner joins. Hang tight!
        </div>
      </div>
    </div>
  );
}
