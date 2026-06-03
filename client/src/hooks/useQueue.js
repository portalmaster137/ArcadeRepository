import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useQueue(gameId) {
  const [queue, setQueue] = useState([]);
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gameId) return;

    // Listen to game document
    const gameUnsub = onSnapshot(doc(db, 'games', gameId), (snap) => {
      if (snap.exists()) {
        setGame({ id: snap.id, ...snap.data() });
      }
    });

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
