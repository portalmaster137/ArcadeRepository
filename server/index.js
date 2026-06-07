require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const cors = require('cors');
const crypto = require('crypto');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// ── Firebase init ────────────────────────────────────────────────────────────
// Vercel serverless may re-evaluate this module on warm invocations; cache the
// Admin SDK on globalThis to avoid "default app already exists" errors. This is
// the same pattern the Firebase Functions runtime uses internally.
const firebaseApp = globalThis.__arcadeFirebaseApp ||= initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    clientId: process.env.FIREBASE_CLIENT_ID,
  }),
});
const db = globalThis.__arcadeDb ||= getFirestore(firebaseApp);

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
  // `credentials: false` means we don't echo back `Access-Control-Allow-Credentials`,
  // so the browser will send the `__session` cookie based on its `SameSite=None;
  // Secure` policy alone (no `credentials: 'include'` on the client side either).
  // An explicit list (not `*`) is required once you set `credentials: true`; with
  // `false` either works, but a list makes the allowlist obvious in source.
  origin: ['https://app.porta137.com', 'https://api.porta137.com'],
  credentials: false,
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

// ── Head-of-queue readiness deadline ────────────────────────────────────────
// When a slot becomes the head of the queue, the player(s) have READY_TTL_MS
// to confirm they're ready ("Start now"). If they don't, the slot is auto-voided
// and the queue advances. They can also extend once by EXTEND_TTL_MS.
//
// In the previous (long-running) runtime, auto-void was driven by an in-process
// Map<gameId, Map<slotId, NodeJS.Timeout>> and a setTimeout per slot. On Vercel
// serverless that map is empty between invocations, so we use a lazy-void
// model: getHeadSlotLive (below) is called on every head-touching user request,
// and any time the head's readyDeadline has passed it voids the slot on the
// spot. A small GET /api/tick endpoint walks every game and calls
// getHeadSlotLive on each; the client polls it every 30s while a queue page
// is open, so the cabinet's always-on browser acts as the "scheduler." No
// Vercel Cron or external scheduler required (which keeps the project on
// the Hobby plan).
//
// Trade-off: a queue with NO open browsers sits un-voided until the next
// player loads the page. For an arcade app this is fine — the cabinet
// screen is always on, and players load the page from their phones to join.

const READY_TTL_MS = 60 * 1000;     // 60 seconds
const EXTEND_TTL_MS = 120 * 1000;   // 2 minutes

// Sets readyDeadline = now + delayMs on a slot. The deadline is the single
// source of truth for "is this head expired?" — the cron handler enforces it.
// No-op if the ref is null. Preserves extensionUsed; only the explicit
// /queue/extend route should ever flip it.
async function stampReadyDeadline(slotRef, gameId, slotId, delayMs = READY_TTL_MS) {
  if (!slotRef) return;
  await slotRef.update({ readyDeadline: new Date(Date.now() + delayMs) });
}

// Looks up the current head and stamps it with a fresh readyDeadline. Called
// whenever a head slot is removed (done, leave-with-empty, auto-void).
// Half-filled duets get no deadline — the slot sits there waiting for its
// partner to join, and a deadline will be stamped when a full slot becomes
// the head (via auto-pair, invite-consume, or this function after the
// half-filled head is finally filled or removed).
async function stampAndScheduleNewHead(gameId) {
  const head = await getHeadSlot(gameId);
  if (!head) return;
  if (!slotIsPlayable(head)) {
    // Half-filled duet head — bail. The slot has no readyDeadline in Firestore,
    // so getHeadSlotLive and the cron won't try to void it on the next read/tick.
    return;
  }
  const ref = db.collection('games').doc(gameId).collection('queue').doc(head.id);
  // Preserve any prior extensionUsed so a confirmed-no-then-fresh-head doesn't
  // get a free fresh extension. (Resetting would let a user re-extend on every
  // promotion, which is the wrong behavior — extend is per-attempt, not per-promotion.)
  await ref.update({ readyDeadline: new Date(Date.now() + READY_TTL_MS) });
}

// Lazy-check wrapper around getHeadSlot. If the head's readyDeadline has
// already passed, void it on the spot and recurse on the new head. This is the
// safety net for the window between the deadline passing and the next cron
// tick — it also serves any user request that happens to be in flight.
async function getHeadSlotLive(gameId) {
  const head = await getHeadSlot(gameId);
  if (head && head.readyDeadline && head.readyDeadline.toMillis() <= Date.now()) {
    await db.collection('games').doc(gameId).collection('queue').doc(head.id).delete();
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
    // Only stamp a readyDeadline if the slot is actually playable. A
    // half-filled duet (first joiner of a 'duet' or 'invite' formation) has
    // nothing to confirm yet — the readiness deadline will be stamped later,
    // when the partner joins and the slot fills. A solo-on-duet-cab is fully
    // playable (mode: 'solo'), and a solo game is trivially playable, so both
    // stamp immediately. The cron + getHeadSlotLive will enforce the deadline.
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
        return res.json({ success: true, joined: 'auto_pair', slotId: head.id });
      }
    }

    const newDocRef = await queueRef.add(newSlot);
    // newSlotIsPlayable already wrote readyDeadline into newSlot (above) when the
    // slot was created; the cron + getHeadSlotLive will enforce it from here.
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
          // Slot is being deleted. If it was the head, stamp the new head (if
          // any) so it gets a fresh readyDeadline. The deadline is the source
          // of truth — no in-process timer to clear.
          await slotDoc.ref.delete();
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

    await db.collection('games').doc(gameId).collection('queue').doc(head.id).delete();
    // Promote the new head (if any) — stamps its readyDeadline.
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
// Any member of the head slot can call this to clear the readiness deadline and
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
      // Race: the deadline passed (and the slot may have been voided by the
      // cron or getHeadSlotLive) between the read and here. Surface as
      // slot_expired.
      return res.status(410).json({ error: 'slot_expired' });
    }
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
    // Defense in depth: a half-filled duet has no readiness deadline to extend.
    // Mirrors the confirm-ready guard.
    if (!slotIsPlayable(head)) {
      return res.status(409).json({ error: 'slot_not_full', message: 'Waiting for your partner to join.' });
    }
    if (head.extensionUsed) {
      return res.status(400).json({ error: 'extension_already_used' });
    }
    const newDeadline = new Date(Date.now() + EXTEND_TTL_MS);
    await db.collection('games').doc(gameId)
      .collection('queue').doc(head.id)
      .update({
        readyDeadline: newDeadline,
        extensionUsed: true,
        extendedDeadline: newDeadline,
      });
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

// GET /api/tick — lazy-void keepalive.
// Cheap, unauthenticated. Walks every game and calls getHeadSlotLive, which
// voids any head whose readyDeadline has passed. The client polls this on a
// 30s interval while a queue page is open, so the cabinet's always-on browser
// drives the auto-void in lieu of an external scheduler.
app.get('/api/tick', async (req, res) => {
  try {
    const gamesSnap = await db.collection('games').get();
    let games = 0;
    for (const gameDoc of gamesSnap.docs) {
      games += 1;
      await getHeadSlotLive(gameDoc.id);
    }
    res.json({ ok: true, games });
  } catch (err) {
    console.error('tick failed:', err);
    res.status(500).json({ error: 'tick_failed' });
  }
});

// ── Export ──────────────────────────────────────────────────────────────────
// Vercel invokes the exported function with the Node-style (req, res) pair.
// No app.listen() — the serverless runtime is request-scoped.
module.exports = app;
