require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const cors = require('cors');
const crypto = require('crypto');
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

// Persist sessions in Firestore so they survive server restarts.
// The store lives in ./session-store.js and is a small custom express-session
// Store class — no third-party dependency needed.
const FirestoreSessionStore = require('./session-store');

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

// Trust the first reverse-proxy hop. In production, Caddy terminates TLS in
// front of the API; without this, `req.secure` stays false and the
// `cookie.secure: true` flag silently drops the session cookie. The value
// `1` (not `true`) means "trust exactly one proxy hop" — safer than
// `true`, which would trust the entire chain.
app.set('trust proxy', 1);

app.use(cors({
  // Accept a single URL or a comma-separated list (for staging or local dev
  // against the same deployment). `credentials: true` requires the response
  // to echo back a specific origin, not `*`, so an array here is correct.
  origin: ('https://app.porta137.com')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  credentials: true,
}));

app.use(express.json());

app.use(session({
  store: new (FirestoreSessionStore(session, db))(),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: '__session',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    // SameSite=None is required for the session cookie to be sent on
    // cross-subdomain requests (app.porta137.com → api.porta137.com).
    // Browsers require `Secure` whenever `SameSite=None`, so the prod
    // combo is `Secure + SameSite=None`; dev stays on `Lax` to keep
    // localhost cookie behavior unchanged.
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

app.use(passport.initialize());
app.use(passport.session());

// Liveness probe for Docker / uptime monitors. Intentionally trivial — no
// Firestore access, no auth — so it's safe to hit every few seconds and
// stays healthy even if downstream services are degraded.
app.get('/healthz', (req, res) => {
  res.json({ ok: true });
});

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

// ── Helpers ──────────────────────────────────────────────────────────────────

const INVITE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function newInviteToken() {
  return crypto.randomBytes(24).toString('hex');
}

function buildMember(user) {
  return {
    userId: user.id,
    username: user.username,
    globalName: user.globalName,
    avatar: user.avatar,
  };
}

// Find an existing slot for a user across all games.
// Returns { gameId, slot } or null.
async function findUserSlot(userId) {
  const allGamesSnap = await db.collection('games').get();
  for (const gameDoc of allGamesSnap.docs) {
    const queueSnap = await gameDoc.ref.collection('queue').get();
    for (const slotDoc of queueSnap.docs) {
      const data = slotDoc.data();
      if ((data.members || []).some(m => m.userId === userId)) {
        return { gameId: gameDoc.id, slotId: slotDoc.id, slot: { id: slotDoc.id, ...data } };
      }
    }
  }
  return null;
}

// Returns the head of a game's queue (first slot by joinedAt) — the "current player" slot.
async function getHeadSlot(gameId) {
  const snap = await db.collection('games').doc(gameId)
    .collection('queue')
    .orderBy('joinedAt', 'asc')
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

// Returns true if the slot is fully playable: solo mode, or all seats filled.
// A half-filled duet returns false — that slot is waiting for a partner, not
// for someone to approach the cabinet. Used to gate the readiness timer: a
// half-filled head slot should not stamp a readyDeadline or arm an auto-void
// timer; it just sits there waiting for the second member to join.
function slotIsPlayable(slot) {
  if (!slot) return false;
  if (slot.mode === 'solo') return true;
  const cap = Number.isInteger(slot.playersPerSlot) ? slot.playersPerSlot : 1;
  return (slot.members || []).length >= cap;
}

// ── Head-of-queue readiness timer ────────────────────────────────────────────
// When a slot becomes the head of the queue, the player(s) have READY_TTL_MS
// to confirm they're ready ("Start now"). If they don't, the slot is auto-voided
// and the queue advances. They can also extend once by EXTEND_TTL_MS.

const READY_TTL_MS = 60 * 1000;     // 60 seconds
const EXTEND_TTL_MS = 120 * 1000;   // 2 minutes

// In-process map of pending auto-void timers, keyed by (gameId, slotId).
// Module-scoped — rehydrated from Firestore on startup (see rehydrateHeadTimers).
const headTimers = new Map(); // gameId -> Map<slotId, NodeJS.Timeout>

function clearHeadTimer(gameId, slotId) {
  const gameTimers = headTimers.get(gameId);
  if (!gameTimers) return;
  const t = gameTimers.get(slotId);
  if (t) clearTimeout(t);
  gameTimers.delete(slotId);
  if (gameTimers.size === 0) headTimers.delete(gameId);
}

function scheduleHeadTimer(gameId, slotId, delayMs) {
  clearHeadTimer(gameId, slotId);
  let gameTimers = headTimers.get(gameId);
  if (!gameTimers) {
    gameTimers = new Map();
    headTimers.set(gameId, gameTimers);
  }
  const t = setTimeout(async () => {
    clearHeadTimer(gameId, slotId);
    try {
      // Lazy double-check: only void if this slot is still the head AND its
      // deadline has actually passed. Guards against races where the slot was
      // confirmed/extended/left between scheduling and firing.
      const head = await getHeadSlot(gameId);
      if (head && head.id === slotId && head.readyDeadline
          && head.readyDeadline.toMillis() <= Date.now()) {
        await db.collection('games').doc(gameId)
          .collection('queue').doc(slotId).delete();
        // Promote the new head (if any) — also stamps its readyDeadline + arms its timer.
        await stampAndScheduleNewHead(gameId);
      }
    } catch (err) {
      console.error('head timer void failed:', err);
    }
  }, delayMs);
  gameTimers.set(slotId, t);
}

// Sets readyDeadline = now + delayMs on a slot and arms the auto-void timer.
// No-op if the ref is null. Preserves extensionUsed; extensionUsed is the user's
// committed state and only the explicit /queue/extend route should ever flip it.
async function stampReadyDeadline(slotRef, gameId, slotId, delayMs = READY_TTL_MS) {
  if (!slotRef) return;
  await slotRef.update({ readyDeadline: new Date(Date.now() + delayMs) });
  scheduleHeadTimer(gameId, slotId, delayMs);
}

// Looks up the current head, stamps it with a fresh readyDeadline, and arms a
// timer. Called whenever a head slot is removed (done, leave-with-empty, auto-void).
// Half-filled duets get no timer — the slot sits there waiting for its partner
// to join, and the timer will only be stamped when a full slot becomes the head
// (either via auto-pair/invite-consume on the head itself, or via this function
// after the half-filled head is finally filled or removed).
async function stampAndScheduleNewHead(gameId) {
  const head = await getHeadSlot(gameId);
  if (!head) return;
  if (!slotIsPlayable(head)) {
    // Half-filled duet head — clear any straggler timer (defense in depth) and
    // bail. The slot has no readyDeadline in Firestore, so getHeadSlotLive
    // won't try to void it on the next read.
    clearHeadTimer(gameId, head.id);
    return;
  }
  const ref = db.collection('games').doc(gameId).collection('queue').doc(head.id);
  // Preserve any prior extensionUsed so a confirmed-no-then-fresh-head doesn't
  // get a free fresh extension. (Resetting would let a user re-extend on every
  // promotion, which is the wrong behavior — extend is per-attempt, not per-promotion.)
  await ref.update({ readyDeadline: new Date(Date.now() + READY_TTL_MS) });
  scheduleHeadTimer(gameId, head.id, READY_TTL_MS);
}

// Lazy-check wrapper around getHeadSlot. If the head's readyDeadline has
// already passed, void it on the spot and recurse on the new head. This is the
// safety net for cases where a timer should have fired but didn't (e.g. server
// restart between scheduling and firing).
async function getHeadSlotLive(gameId) {
  const head = await getHeadSlot(gameId);
  if (head && head.readyDeadline && head.readyDeadline.toMillis() <= Date.now()) {
    await db.collection('games').doc(gameId).collection('queue').doc(head.id).delete();
    clearHeadTimer(gameId, head.id);
    await stampAndScheduleNewHead(gameId);
    return getHeadSlotLive(gameId);
  }
  return head;
}

// ── Queue routes ─────────────────────────────────────────────────────────────

// GET /api/games/:gameId/queue — snapshot of the queue (debug / fallback)
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

// POST /api/games/:gameId/queue/join
// body: { formation?: 'open' | 'invite', inviteToken?: string }
//
// formation: 'open'  — auto-pair with anyone (default if absent)
// formation: 'invite' — first joiner creates a 1-member slot with an invite token
//                       (no body changes; the invite is generated and stored on the slot,
//                        then read back via the queue's inviteToken field)
// inviteToken present — caller is consuming a previously-issued invite; the route
//                       finds the slot with that token and adds the caller as a member.
app.post('/api/games/:gameId/queue/join', requireAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const userId = req.user.id;
    // formation: 'open' (default for duet games — auto-pair with anyone),
    //            'invite' (duet games — pair with a specific friend via token),
    //            'solo'  (duet games — play alone on a single seat; one member fills the slot).
    // 'solo' is only meaningful when playersPerSlot > 1. For solo games, any of the three
    // values collapses to a 1-member solo slot.
    const rawFormation = req.body?.formation;
    const formation = ['open', 'invite', 'solo'].includes(rawFormation) ? rawFormation : 'open';
    const inviteToken = req.body?.inviteToken || null;

    const gameRef = db.collection('games').doc(gameId);
    const gameDoc = await gameRef.get();
    if (!gameDoc.exists) {
      return res.status(404).json({ error: 'Game not found' });
    }
    const game = gameDoc.data();
    const playersPerSlot = Number.isInteger(game.playersPerSlot) && game.playersPerSlot > 0
      ? game.playersPerSlot
      : 1;

    // Already-queued check (system-wide)
    const existing = await findUserSlot(userId);
    if (existing) {
      return res.status(409).json({
        error: 'already_queued',
        message: 'You are already in a queue. Leave that queue first.',
        gameId: existing.gameId,
        gameName: (await db.collection('games').doc(existing.gameId).get()).data()?.name,
      });
    }

    // NOTE: per-member joinedAt is a plain JS Date — FieldValue.serverTimestamp()
    // is not allowed inside array elements. The slot-level joinedAt (set below
    // when the slot is created) is the authoritative timestamp for queue ordering.
    const member = { ...buildMember(req.user), joinedAt: new Date() };
    const queueRef = gameRef.collection('queue');

    // ── Invitee path: consume an existing invite token ──
    if (inviteToken) {
      const candidateSnap = await queueRef
        .where('inviteToken', '==', inviteToken)
        .limit(1)
        .get();
      if (candidateSnap.empty) {
        return res.status(400).json({ error: 'invalid_or_expired_invite' });
      }
      const slotDoc = candidateSnap.docs[0];
      const slot = slotDoc.data();
      if ((slot.members || []).length >= playersPerSlot) {
        return res.status(400).json({ error: 'slot_full' });
      }
      if (slot.inviteExpiresAt && slot.inviteExpiresAt.toMillis() < Date.now()) {
        return res.status(400).json({ error: 'invalid_or_expired_invite' });
      }
      await slotDoc.ref.update({
        members: FieldValue.arrayUnion(member),
        inviteToken: FieldValue.delete(),
        inviteExpiresAt: FieldValue.delete(),
        mode: 'duet',
      });
      // If the invitee just filled the head slot, give the (now-complete) slot a
      // fresh readiness window. Preserves extensionUsed if it was already set.
      const head = await getHeadSlot(gameId);
      if (head && head.id === slotDoc.id) {
        await db.collection('games').doc(gameId).collection('queue').doc(slotDoc.id)
          .update({ readyDeadline: new Date(Date.now() + READY_TTL_MS) });
        scheduleHeadTimer(gameId, slotDoc.id, READY_TTL_MS);
      }
      return res.json({ success: true, joined: 'invite', slotId: slotDoc.id });
    }

    // First-joiner path: create a new slot ──
    const isDuet = playersPerSlot > 1;
    // A solo player on a duet cabinet is a complete slot (ready to play) — the
    // other seat stays intentionally empty. We mark it mode: 'solo' so the
    // status/leave checks know not to wait for a second member.
    const isSoloOnDuetCab = isDuet && formation === 'solo';
    const newSlot = {
      mode: isSoloOnDuetCab ? 'solo' : (isDuet ? 'duet' : 'solo'),
      playersPerSlot,                    // denormalized from the game so the slot
                                         // is self-describing for status/leave checks
      members: [member],
      status: 'waiting',
      // Authoritative timestamp for queue ordering. Lives at the slot level
      // (not inside the members array, where serverTimestamp is forbidden).
      joinedAt: FieldValue.serverTimestamp(),
      // extensionUsed starts false; flipped to true only on the first explicit
      // /queue/extend call. Always written so the field exists on every slot
      // (avoids having to handle "field missing" downstream).
      extensionUsed: false,
    };
    // Only stamp a readyDeadline + arm a timer if the slot is actually playable.
    // A half-filled duet (first joiner of a 'duet' or 'invite' formation) has
    // nothing to confirm yet — the readiness timer will start later, when the
    // partner joins and the slot fills. A solo-on-duet-cab is fully playable
    // (mode: 'solo'), and a solo game is trivially playable, so both stamp.
    const newSlotIsPlayable = isSoloOnDuetCab || !isDuet;
    if (newSlotIsPlayable) {
      newSlot.readyDeadline = new Date(Date.now() + READY_TTL_MS);
    }

    // If the user wants a specific invite partner, generate a token now.
    // (Solo-on-duet doesn't generate a token — the second seat is intentionally empty.)
    if (formation === 'invite' && isDuet) {
      newSlot.inviteToken = newInviteToken();
      newSlot.inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS);
    } else if (formation === 'open' && isDuet) {
      // 'open' duet: try to auto-fill an existing open duet slot at the head of the queue.
      const head = await getHeadSlot(gameId);
      if (head && head.mode === 'duet'
          && (head.members || []).length < playersPerSlot
          && !head.inviteToken) {
        await db.collection('games').doc(gameId).collection('queue').doc(head.id)
          .update({ members: FieldValue.arrayUnion(member) });
        // The slot just became complete — reset its readiness window to 60s.
        // Preserves extensionUsed: auto-pairing is not a manual extension.
        await db.collection('games').doc(gameId).collection('queue').doc(head.id)
          .update({ readyDeadline: new Date(Date.now() + READY_TTL_MS) });
        scheduleHeadTimer(gameId, head.id, READY_TTL_MS);
        return res.json({ success: true, joined: 'auto_pair', slotId: head.id });
      }
    }

    const newDocRef = await queueRef.add(newSlot);
    if (newSlotIsPlayable) {
      scheduleHeadTimer(gameId, newDocRef.id, READY_TTL_MS);
    }
    return res.json({
      success: true,
      joined: isSoloOnDuetCab ? 'solo' : 'new_slot',
      slotId: newDocRef.id,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/games/:gameId/queue/leave
// Removes the caller from whichever slot they are a member of. Deletes the slot
// entirely if it becomes empty.
app.post('/api/games/:gameId/queue/leave', requireAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const userId = req.user.id;
    const queueRef = db.collection('games').doc(gameId).collection('queue');
    const snap = await queueRef.get();
    for (const slotDoc of snap.docs) {
      const data = slotDoc.data();
      if ((data.members || []).some(m => m.userId === userId)) {
        const remaining = (data.members || []).filter(m => m.userId !== userId);
        if (remaining.length === 0) {
          // Slot is being deleted. If it was the head, clear its timer and
          // stamp the new head (if any). We clear unconditionally — the slot
          // won't exist after the delete, and the timer map only ever has
          // entries for live slots.
          clearHeadTimer(gameId, slotDoc.id);
          await slotDoc.ref.delete();
          // Promote the new head (if any) — also stamps readyDeadline and arms
          // its timer. This is the only way the next player learns the slot
          // is theirs; otherwise the timer map is empty and the new head sits
          // unadvertised.
          await stampAndScheduleNewHead(gameId);
        } else {
          await slotDoc.ref.update({ members: remaining });
        }
        return res.json({ success: true });
      }
    }
    res.json({ success: true, note: 'not_in_queue' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/games/:gameId/queue/status
// body: { status: 'playing' | 'finishing' }
// Any member of the head slot may set the head slot's status.
app.post('/api/games/:gameId/queue/status', requireAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const { status } = req.body;
    const userId = req.user.id;

    const validStatuses = ['playing', 'finishing'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const head = await getHeadSlotLive(gameId);
    if (!head) {
      return res.status(404).json({ error: 'Not in queue' });
    }
    if (!(head.members || []).some(m => m.userId === userId)) {
      return res.status(403).json({ error: 'Only the current player can update status' });
    }
    // A slot is ready to play if it's marked mode: 'solo' (the player chose to play
    // alone on a duet cabinet) OR if it has all its seats filled.
    const requiredMembers = head.mode === 'solo'
      ? 1
      : (Number.isInteger(head.playersPerSlot) ? head.playersPerSlot : 1);
    if ((head.members || []).length < requiredMembers) {
      return res.status(409).json({ error: 'slot_not_full', message: 'Waiting for your partner to join.' });
    }

    await db.collection('games').doc(gameId)
      .collection('queue').doc(head.id).update({ status });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/games/:gameId/queue/done
// Any member of the head slot may mark it done; the entire slot is removed.
app.post('/api/games/:gameId/queue/done', requireAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const userId = req.user.id;

    const head = await getHeadSlotLive(gameId);
    if (!head) {
      return res.status(404).json({ error: 'Not in queue' });
    }
    if (!(head.members || []).some(m => m.userId === userId)) {
      return res.status(403).json({ error: 'Only the current player can mark done' });
    }

    clearHeadTimer(gameId, head.id);
    await db.collection('games').doc(gameId).collection('queue').doc(head.id).delete();
    // Promote the new head (if any) — stamps readyDeadline and arms its timer.
    await stampAndScheduleNewHead(gameId);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/games/:gameId/queue/invite
// Returns the caller's open invite token (refreshes if missing or expired).
// If the caller has no open duet slot with an invite seat, returns 400.
app.post('/api/games/:gameId/queue/invite', requireAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const userId = req.user.id;
    const queueRef = db.collection('games').doc(gameId).collection('queue');
    const snap = await queueRef.get();

    for (const slotDoc of snap.docs) {
      const data = slotDoc.data();
      const isMine = (data.members || []).some(m => m.userId === userId);
      if (!isMine) continue;
      const requiredMembers = Number.isInteger(data.playersPerSlot) ? data.playersPerSlot : 1;
      const isIncomplete = (data.members || []).length < requiredMembers;
      if (!isIncomplete) continue;
      const needsInvite = !!data.inviteToken; // already invite-mode
      if (!needsInvite) continue;

      // Refresh if expired
      if (data.inviteExpiresAt && data.inviteExpiresAt.toMillis() < Date.now()) {
        const fresh = newInviteToken();
        await slotDoc.ref.update({
          inviteToken: fresh,
          inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
        });
        return res.json({ inviteToken: fresh });
      }
      return res.json({ inviteToken: data.inviteToken });
    }
    res.status(400).json({ error: 'no_open_invite' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/games/:gameId/queue/confirm-ready
// Any member of the head slot can call this to clear the readiness timer and
// transition the slot to 'playing'. Has the same effect as the old "I've Started!"
// button in PlayerControls but is the canonical way the readiness banner works.
app.post('/api/games/:gameId/queue/confirm-ready', requireAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const userId = req.user.id;
    const head = await getHeadSlotLive(gameId);
    if (!head) {
      return res.status(404).json({ error: 'Not in queue' });
    }
    if (!(head.members || []).some(m => m.userId === userId)) {
      return res.status(403).json({ error: 'Only the current player can start' });
    }
    // Defense in depth: a half-filled duet must not transition to 'playing'
    // (the slot is still waiting for a partner). The client UI hides the
    // confirm-ready button in this case, but the API is public.
    if (!slotIsPlayable(head)) {
      return res.status(409).json({ error: 'slot_not_full', message: 'Waiting for your partner to join.' });
    }
    if (head.readyDeadline && head.readyDeadline.toMillis() <= Date.now()) {
      // Race: the timer fired between getHeadSlotLive and here. The slot is
      // already deleted; surface that as slot_expired.
      return res.status(410).json({ error: 'slot_expired' });
    }
    clearHeadTimer(gameId, head.id);
    await db.collection('games').doc(gameId)
      .collection('queue').doc(head.id)
      .update({ status: 'playing', readyDeadline: null });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/games/:gameId/queue/extend
// Any member of the head slot can call this once per slot to add EXTEND_TTL_MS
// to the readiness deadline. Subsequent calls return 400 extension_already_used.
app.post('/api/games/:gameId/queue/extend', requireAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const userId = req.user.id;
    const head = await getHeadSlotLive(gameId);
    if (!head) {
      return res.status(404).json({ error: 'Not in queue' });
    }
    if (!(head.members || []).some(m => m.userId === userId)) {
      return res.status(403).json({ error: 'Only the current player can extend' });
    }
    // Defense in depth: a half-filled duet has no readiness timer to extend.
    // Mirrors the confirm-ready guard.
    if (!slotIsPlayable(head)) {
      return res.status(409).json({ error: 'slot_not_full', message: 'Waiting for your partner to join.' });
    }
    if (head.extensionUsed) {
      return res.status(400).json({ error: 'extension_already_used' });
    }
    const newDeadline = new Date(Date.now() + EXTEND_TTL_MS);
    clearHeadTimer(gameId, head.id);
    await db.collection('games').doc(gameId)
      .collection('queue').doc(head.id)
      .update({
        readyDeadline: newDeadline,
        extensionUsed: true,
        extendedDeadline: newDeadline,
      });
    scheduleHeadTimer(gameId, head.id, EXTEND_TTL_MS);
    res.json({ success: true, readyDeadline: newDeadline });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/cabinet-groups — list all cabinet groups
app.get('/api/cabinet-groups', async (req, res) => {
  try {
    const snap = await db.collection('cabinetGroups').get();
    const groups = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ groups });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/cabinet-groups/:groupId
app.get('/api/cabinet-groups/:groupId', async (req, res) => {
  try {
    const doc = await db.collection('cabinetGroups').doc(req.params.groupId).get();
    if (!doc.exists) return res.status(404).json({ error: 'Group not found' });
    res.json({ group: { id: doc.id, ...doc.data() } });
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
    const { id, name, description, cabinetNumber, playersPerSlot, groupId, subtitle, location } = req.body;
    if (!id || !name) return res.status(400).json({ error: 'id and name required' });
    await db.collection('games').doc(id).set({
      name,
      subtitle: subtitle || '',
      description: description || '',
      cabinetNumber: cabinetNumber || 1,
      location: location || '',
      playersPerSlot: Number.isInteger(playersPerSlot) && playersPerSlot > 0 ? playersPerSlot : 1,
      groupId: groupId || null,
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
  console.log(`🎮 Arcade Queue server listening on 0.0.0.0:${PORT}`);
});

// Rehydrate readiness timers from Firestore on startup. The in-process timer
// map is module-scoped and empty after a restart; this scan rebuilds it from
// the live queue subcollections. Without this, a slot whose 60s window is
// still in flight at the moment of a server restart would silently sit
// un-voided until the next user-triggered request hit getHeadSlotLive.
async function rehydrateHeadTimers() {
  try {
    const gamesSnap = await db.collection('games').get();
    for (const gameDoc of gamesSnap.docs) {
      const head = await getHeadSlot(gameDoc.id);
      if (head && head.readyDeadline) {
        // Defense in depth: even if a stale slot from a pre-fix deploy still
        // has a readyDeadline on a half-filled duet, don't arm a timer for it.
        // The next /queue/leave or /queue/done will fall through
        // stampAndScheduleNewHead (which also gates on slotIsPlayable), so this
        // case self-heals on the first head removal.
        if (!slotIsPlayable(head)) {
          clearHeadTimer(gameDoc.id, head.id);
          continue;
        }
        const remaining = head.readyDeadline.toMillis() - Date.now();
        if (remaining <= 0) {
          // Already expired during the restart — void it now and stamp the new head.
          await db.collection('games').doc(gameDoc.id)
            .collection('queue').doc(head.id).delete();
          await stampAndScheduleNewHead(gameDoc.id);
        } else {
          scheduleHeadTimer(gameDoc.id, head.id, remaining);
        }
      }
    }
  } catch (err) {
    console.error('rehydrateHeadTimers failed:', err);
  }
}
rehydrateHeadTimers();
