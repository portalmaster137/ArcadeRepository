import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useGames } from '../hooks/useGames';
import { useCabinetGroups } from '../hooks/useCabinetGroups';

function GroupCard({ group, games }) {
  const queueUrl = `${window.location.origin}/queue/group/${group.id}`;

  function copyLink() {
    navigator.clipboard.writeText(queueUrl);
  }

  return (
    <div className="card card-accent-cyan" style={{ textAlign: 'center' }}>
      {group.location && (
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.6rem',
          letterSpacing: '0.2em',
          color: 'var(--muted)',
          marginBottom: '0.4rem',
        }}>
          {group.location}
        </div>
      )}
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: '1.15rem',
        fontWeight: 900,
        color: 'var(--cyan)',
        textShadow: '0 0 16px rgba(0,245,255,0.4)',
        marginBottom: '0.35rem',
        letterSpacing: '0.05em',
        lineHeight: 1.15,
      }}>
        {group.name}
      </div>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: '0.55rem',
        color: 'var(--pink)',
        letterSpacing: '0.12em',
        marginBottom: '1rem',
      }}>
        {games.length} CABINET{games.length === 1 ? '' : 'S'} · DUET
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link to={`/queue/group/${group.id}`} className="btn btn-solid-cyan" style={{ textDecoration: 'none' }}>
          Open Queue
        </Link>
        <button className="btn btn-ghost" onClick={copyLink} title={queueUrl}>
          Copy Link
        </button>
      </div>
    </div>
  );
}

function GameCard({ game }) {
  const queueUrl = `${window.location.origin}/queue/${game.id}`;

  function copyLink() {
    navigator.clipboard.writeText(queueUrl);
  }

  const cabinetBits = [
    game.cabinetNumber != null && `CABINET ${game.cabinetNumber}`,
    game.location,
  ].filter(Boolean).join(' · ');

  return (
    <div className="card card-accent-cyan" style={{ textAlign: 'center' }}>
      {cabinetBits && (
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.6rem',
          letterSpacing: '0.2em',
          color: 'var(--muted)',
          marginBottom: '0.4rem',
        }}>
          {cabinetBits}
        </div>
      )}
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: '1.15rem',
        fontWeight: 900,
        color: 'var(--cyan)',
        textShadow: '0 0 16px rgba(0,245,255,0.4)',
        marginBottom: game.subtitle ? '0.2rem' : '1rem',
        letterSpacing: '0.05em',
        lineHeight: 1.15,
      }}>
        {game.name}
      </div>
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

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link to={`/queue/${game.id}`} className="btn btn-solid-cyan" style={{ textDecoration: 'none' }}>
          Open Queue
        </Link>
        <button className="btn btn-ghost" onClick={copyLink} title={queueUrl}>
          Copy Link
        </button>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { games, loading: gamesLoading } = useGames();
  const { groups, loading: groupsLoading } = useCabinetGroups();

  // Build a list of cards: one per group, plus one per ungrouped game.
  const cards = useMemo(() => {
    const groupIds = new Set(groups.map(g => g.id));
    const cards = [];
    for (const g of groups) {
      const memberGames = (g.gameIds || [])
        .map(id => games.find(game => game.id === id))
        .filter(Boolean);
      cards.push({ type: 'group', group: g, games: memberGames });
    }
    for (const game of games) {
      if (!game.groupId || !groupIds.has(game.groupId)) {
        cards.push({ type: 'game', game });
      }
    }
    return cards;
  }, [games, groups]);

  const loading = gamesLoading || groupsLoading;

  return (
    <main style={{ flex: 1, maxWidth: '960px', margin: '0 auto', padding: '2.5rem 1.5rem', width: '100%' }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.65rem',
          letterSpacing: '0.25em',
          color: 'var(--pink)',
          marginBottom: '0.75rem',
        }}>
          ARCADE QUEUE SYSTEM
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 900,
          fontSize: 'clamp(1.8rem, 6vw, 2.8rem)',
          lineHeight: 1,
          marginBottom: '0.75rem',
          letterSpacing: '0.03em',
        }}>
          <span className="neon-cyan">NO MORE</span>
          <br />
          <span style={{ color: 'var(--white)' }}>CROWDING</span>
          <br />
          <span className="neon-pink">THE CAB</span>
        </h1>
        <p style={{ color: 'var(--muted)', maxWidth: '420px', margin: '0 auto', lineHeight: 1.6 }}>
          Pick a cabinet below to see the live queue, or scan the QR code at the cab to join on your phone.
        </p>
      </div>

      {/* Game / Group cards */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <div className="spinner" />
          <p className="text-muted" style={{ fontFamily: 'var(--font-display)', fontSize: '0.6rem', letterSpacing: '0.15em' }}>LOADING</p>
        </div>
      ) : cards.length === 0 ? (
        <div style={{ textAlign: 'center', marginBottom: '2rem', color: 'var(--muted)' }}>
          No games registered yet. Add one via <code>POST /api/games</code>.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '1rem',
          marginBottom: '2.5rem',
        }}>
          {cards.map(card => (
            card.type === 'group'
              ? <GroupCard key={`group-${card.group.id}`} group={card.group} games={card.games} />
              : <GameCard key={`game-${card.game.id}`} game={card.game} />
          ))}
        </div>
      )}

      {/* How it works */}
      <div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.6rem',
          letterSpacing: '0.2em',
          color: 'var(--muted)',
          marginBottom: '1.25rem',
          textAlign: 'center',
        }}>
          HOW IT WORKS
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
          {[
            { icon: '📱', title: 'Scan', desc: 'Scan the QR code at the cabinet with your phone' },
            { icon: '🎮', title: 'Queue Up', desc: 'Log in with Discord and join the queue in one tap' },
            { icon: '⚡', title: 'Get Notified', desc: "When you're up next, you'll see a live alert" },
            { icon: '🏏', title: 'Play', desc: 'Press "I\'ve Started!" and enjoy your game!' },
          ].map((step, i) => (
            <div key={i} style={{
              background: 'var(--surface)',
              border: '1px solid rgba(0,245,255,0.1)',
              borderRadius: '8px',
              padding: '1rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '1.6rem', marginBottom: '0.4rem' }}>{step.icon}</div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.65rem',
                fontWeight: 700,
                color: 'var(--cyan)',
                letterSpacing: '0.1em',
                marginBottom: '0.3rem',
              }}>
                {step.title.toUpperCase()}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.4 }}>{step.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
