require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const cors = require('cors');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// ── Firebase init ────────────────────────────────────────────────────────────
const firebaseApp = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    clientId: process.env.FIREBASE_CLIENT_ID,
  }),
});
const db = getFirestore(firebaseApp);

// ── Passport / Discord ───────────────────────────────────────────────────────
const DiscordStrategy = require('passport-discord').Strategy;

passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: process.env.DISCORD_CALLBACK_URL,
  scope: ['identify'],
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const userRef = db.collection('users').doc(profile.id);
    const userData = {
      discordId: profile.id,
      username: profile.username,
      discriminator: profile.discriminator || '0',
      avatar: profile.avatar
        ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/${parseInt(profile.id) % 5}.png`,
      globalName: profile.global_name || profile.username,
      updatedAt: FieldValue.serverTimestamp(),
    };
    await userRef.set(userData, { merge: true });
    return done(null, { id: profile.id, ...userData });
  } catch (err) {
    return done(err, null);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const doc = await db.collection('users').doc(id).get();
    done(null, doc.exists ? { id: doc.id, ...doc.data() } : false);
  } catch (err) {
    done(err, null);
  }
});

// ── Express app ──────────────────────────────────────────────────────────────
const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true,
}));

app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

app.use(passport.initialize());
app.use(passport.session());

// ── Auth middleware ──────────────────────────────────────────────────────────
const requireAuth = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Not authenticated' });
};

// ── Auth routes ──────────────────────────────────────────────────────────────
app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: `${process.env.CLIENT_URL}?error=auth_failed` }),
  (req, res) => {
    res.redirect(`${process.env.CLIENT_URL}?login=success`);
  }
);

app.get('/auth/logout', (req, res) => {
  req.logout(() => {
    res.redirect(process.env.CLIENT_URL);
  });
});

app.get('/auth/me', (req, res) => {
  if (!req.isAuthenticated()) return res.json({ user: null });
  res.json({ user: req.user });
});

// ── Queue routes ─────────────────────────────────────────────────────────────

// GET /api/games/:gameId/queue — returns current queue state
app.get('/api/games/:gameId/queue', async (req, res) => {
  try {
    const { gameId } = req.params;
    const gameRef = db.collection('games').doc(gameId);
    const gameDoc = await gameRef.get();

    if (!gameDoc.exists) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const queueSnap = await gameRef.collection('queue')
      .orderBy('joinedAt', 'asc')
      .get();

    const queue = queueSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    res.json({
      game: { id: gameDoc.id, ...gameDoc.data() },
      queue,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/games/:gameId/queue/join — join the queue
app.post('/api/games/:gameId/queue/join', requireAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const userId = req.user.id;

    // Check user isn't already queued anywhere
    const allGamesSnap = await db.collection('games').get();
    for (const gameDoc of allGamesSnap.docs) {
      const existing = await gameDoc.ref.collection('queue').doc(userId).get();
      if (existing.exists) {
        return res.status(409).json({
          error: 'already_queued',
          message: 'You are already in a queue. Leave that queue first.',
          gameId: gameDoc.id,
          gameName: gameDoc.data().name,
        });
      }
    }

    const gameRef = db.collection('games').doc(gameId);
    const gameDoc = await gameRef.get();
    if (!gameDoc.exists) {
      return res.status(404).json({ error: 'Game not found' });
    }

    await gameRef.collection('queue').doc(userId).set({
      userId,
      username: req.user.username,
      globalName: req.user.globalName,
      avatar: req.user.avatar,
      joinedAt: FieldValue.serverTimestamp(),
      status: 'waiting', // waiting | playing | finishing
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/games/:gameId/queue/leave — leave the queue
app.post('/api/games/:gameId/queue/leave', requireAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const userId = req.user.id;
    await db.collection('games').doc(gameId).collection('queue').doc(userId).delete();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/games/:gameId/queue/status — update player status
// body: { status: 'playing' | 'finishing' }
app.post('/api/games/:gameId/queue/status', requireAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const { status } = req.body;
    const userId = req.user.id;

    const validStatuses = ['playing', 'finishing'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const queueRef = db.collection('games').doc(gameId).collection('queue').doc(userId);
    const doc = await queueRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Not in queue' });
    }

    // Only the first person in queue can update status
    const queueSnap = await db.collection('games').doc(gameId)
      .collection('queue').orderBy('joinedAt', 'asc').limit(1).get();

    if (queueSnap.empty || queueSnap.docs[0].id !== userId) {
      return res.status(403).json({ error: 'Only the current player can update status' });
    }

    await queueRef.update({ status });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/games/:gameId/queue/done — current player marks done, removes them
app.post('/api/games/:gameId/queue/done', requireAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const userId = req.user.id;

    const queueSnap = await db.collection('games').doc(gameId)
      .collection('queue').orderBy('joinedAt', 'asc').limit(1).get();

    if (queueSnap.empty || queueSnap.docs[0].id !== userId) {
      return res.status(403).json({ error: 'Only the current player can mark done' });
    }

    await db.collection('games').doc(gameId).collection('queue').doc(userId).delete();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/games — list all games
app.get('/api/games', async (req, res) => {
  try {
    const snap = await db.collection('games').get();
    const games = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ games });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/games — create a game (admin/setup use)
app.post('/api/games', async (req, res) => {
  try {
    const { id, name, description, cabinetNumber } = req.body;
    if (!id || !name) return res.status(400).json({ error: 'id and name required' });
    await db.collection('games').doc(id).set({
      name,
      description: description || '',
      cabinetNumber: cabinetNumber || 1,
      createdAt: FieldValue.serverTimestamp(),
    });
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🎮 SDVX Queue server running on http://localhost:${PORT}`);
});
