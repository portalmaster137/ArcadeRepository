import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useQueue(gameId) {
  const [queue, setQueue] = useState([]);
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gameId) return;

    // Listen to game document. The page renders a 404 if `game` ends up null
    // while `loading` is false, so we must flip `loading` off the moment the
    // game-doc snapshot resolves (either to a doc or to a confirmed absence).
    // Without this, a missing/renamed game doc leaves the page on its spinner
    // indefinitely, because the queue-subcollection listener on its own only
    // fires when there are entries to read.
    const gameUnsub = onSnapshot(
      doc(db, 'games', gameId),
      (snap) => {
        setGame(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
      },
      (err) => {
        console.error('useQueue: game snapshot error', err);
        setLoading(false);
      }
    );

    // Listen to queue subcollection, ordered by joinedAt
    const queueQuery = query(
      collection(db, 'games', gameId, 'queue'),
      orderBy('joinedAt', 'asc')
    );

    const queueUnsub = onSnapshot(queueQuery, (snap) => {
      const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setQueue(entries);
      setLoading(false);
    });

    return () => {
      gameUnsub();
      queueUnsub();
    };
  }, [gameId]);

  return { queue, game, loading };
}
