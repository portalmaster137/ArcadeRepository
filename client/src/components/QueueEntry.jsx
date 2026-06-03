export default function QueueEntry({ entry, position, isCurrentUser, isFirst }) {
  const statusColors = {
    waiting: { color: 'var(--muted)', label: 'WAITING' },
    playing: { color: 'var(--cyan)', label: 'PLAYING' },
    finishing: { color: 'var(--yellow)', label: 'FINISHING SOON' },
  };

  const statusInfo = statusColors[entry.status] || statusColors.waiting;

  // New slot-doc shape: { members: [{ userId, globalName, avatar, ... }] }.
  // Solo games: members.length === 1. The legacy fields (avatar, globalName)
  // may also exist on old docs, so we read from members first.
  const members = entry.members && entry.members.length > 0
    ? entry.members
    : (entry.userId ? [{ userId: entry.userId, globalName: entry.globalName, avatar: entry.avatar }] : []);

  const isDuet = members.length > 1;
  const primary = members[0];
  const partner = members[1];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      padding: '1rem 1.25rem',
      borderRadius: '6px',
      background: isFirst
        ? 'linear-gradient(135deg, rgba(0,245,255,0.08), rgba(0,245,255,0.02))'
        : isCurrentUser
        ? 'linear-gradient(135deg, rgba(180,79,255,0.08), rgba(180,79,255,0.02))'
        : 'rgba(255,255,255,0.02)',
      border: isFirst
        ? '1px solid rgba(0, 245, 255, 0.25)'
        : isCurrentUser
        ? '1px solid rgba(180, 79, 255, 0.25)'
        : '1px solid rgba(255,255,255,0.06)',
      transition: 'all 0.3s ease',
    }}>
      {/* Position number */}
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: '1.1rem',
        fontWeight: 900,
        color: isFirst ? 'var(--cyan)' : 'var(--muted)',
        minWidth: '2rem',
        textAlign: 'center',
        opacity: isFirst ? 1 : 0.6,
      }}>
        {String(position).padStart(2, '0')}
      </div>

      {/* Avatars: stack side-by-side for duets */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <img
          src={primary?.avatar}
          alt={primary?.globalName}
          className="avatar"
          style={{
            width: '40px',
            height: '40px',
            borderColor: isFirst ? 'var(--cyan)' : isCurrentUser ? 'var(--purple)' : 'var(--muted)',
            opacity: isFirst ? 1 : 0.8,
          }}
        />
        {isDuet && (
          <img
            src={partner?.avatar}
            alt={partner?.globalName}
            className="avatar"
            style={{
              width: '40px',
              height: '40px',
              borderColor: isFirst ? 'var(--cyan)' : 'var(--muted)',
              opacity: isFirst ? 1 : 0.8,
              marginLeft: '-12px',
            }}
          />
        )}
      </div>

      {/* Names + status */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 700,
          fontSize: '1rem',
          color: isCurrentUser ? 'var(--purple)' : 'var(--white)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          flexWrap: 'wrap',
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {primary?.globalName || 'Unknown'}
          </span>
          {isDuet && (
            <span style={{ color: 'var(--muted)', fontWeight: 500 }}>
              + {partner?.globalName || 'partner'}
            </span>
          )}
          {isCurrentUser && (
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.5rem',
              color: 'var(--purple)',
              border: '1px solid var(--purple)',
              padding: '0.1rem 0.4rem',
              borderRadius: '2px',
              letterSpacing: '0.1em',
            }}>YOU</span>
          )}
        </div>
        {isFirst && (
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.55rem',
            color: statusInfo.color,
            letterSpacing: '0.1em',
            marginTop: '0.2rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}>
            <span style={{
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              background: statusInfo.color,
              display: 'inline-block',
              animation: entry.status !== 'waiting' ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
            }} />
            {statusInfo.label}
          </div>
        )}
      </div>

      {/* Position label */}
      {isFirst && (
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.55rem',
          color: 'var(--cyan)',
          letterSpacing: '0.1em',
          textAlign: 'right',
        }}>
          NOW<br />PLAYING
        </div>
      )}
      {position === 2 && (
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.55rem',
          color: 'var(--yellow)',
          letterSpacing: '0.1em',
          textAlign: 'right',
        }}>
          UP<br />NEXT
        </div>
      )}
    </div>
  );
}
