/**
 * Run this once to seed your Firebase with the games and cabinet groups.
 * Usage (dev):   node setup-firebase.js
 * Usage (prod):  NODE_ENV=production node setup-firebase.js --confirm-prod
 */
require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// Production guard: refuse to run against a production database unless the
// caller passes an explicit --confirm-prod flag. The script uses .set()
// (overwrite semantics), so an accidental re-run against production would
// wipe any custom fields on the seeded games/groups. Both NODE_ENV and
// the flag are required: the flag is useless without NODE_ENV=production,
// and NODE_ENV=production is useless without the flag.
const isProd = process.env.NODE_ENV === 'production';
const allowProd = process.argv.includes('--confirm-prod');
if (isProd && !allowProd) {
  console.error('');
  console.error('╔════════════════════════════════════════════════════════════╗');
  console.error('║  REFUSING to seed against a production database.           ║');
  console.error('║                                                            ║');
  console.error('║  This script uses .set() (overwrite). Re-running it        ║');
  console.error('║  against a production Firebase project will wipe any       ║');
  console.error('║  custom fields on the seeded games/groups.                 ║');
  console.error('║                                                            ║');
  console.error('║  To proceed, pass the explicit --confirm-prod flag:        ║');
  console.error('║  NODE_ENV=production node setup-firebase.js --confirm-prod ║');
  console.error('╚════════════════════════════════════════════════════════════╝');
  process.exit(2);
}

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    clientId: process.env.FIREBASE_CLIENT_ID,
  }),
});

const db = getFirestore(app);

async function setup() {
  console.log('Setting up Arcade Queue Firebase...');

  // ── Solo cabinet (unchanged from original seed) ──
  await db.collection('games').doc('sound-voltex').set({
    name: 'SOUND VOLTEX',
    subtitle: 'EXCEED GEAR',
    description: 'Konami\'s rhythm game featuring a unique 6-button + knob controller.',
    cabinetNumber: 1,
    location: 'Main Floor',
    playersPerSlot: 1,
    groupId: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log('✅ Created game: sound-voltex (solo)');

  // ── Duet cabinet (maimai) ──
  // Two physical cabinets form one paired group. Each game doc represents
  // one of the two playable machines; playersPerSlot=2 lets two people share
  // a slot on that single machine.
  await db.collection('games').doc('maimai-dx-a').set({
    name: 'maimai DX',
    subtitle: 'UNiVERSE',
    description: 'Sega\'s circular-button rhythm game. Two machines per cabinet, played solo or with a friend.',
    cabinetNumber: 2,
    location: 'Main Floor',
    playersPerSlot: 2,
    groupId: 'maimai-pair-a',
    createdAt: FieldValue.serverTimestamp(),
  });
  await db.collection('games').doc('maimai-dx-b').set({
    name: 'maimai DX',
    subtitle: 'UNiVERSE',
    description: 'Sega\'s circular-button rhythm game. Two machines per cabinet, played solo or with a friend.',
    cabinetNumber: 3,
    location: 'Main Floor',
    playersPerSlot: 2,
    groupId: 'maimai-pair-a',
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log('✅ Created games: maimai-dx-a, maimai-dx-b (duet, paired)');

  // ── Cabinet group (wraps the two physical cabinets into one queue) ──
  await db.collection('cabinetGroups').doc('maimai-pair-a').set({
    name: 'maimai DX · Pair A',
    location: 'Main Floor',
    gameIds: ['maimai-dx-a', 'maimai-dx-b'],
    playersPerSlot: 2,
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log('✅ Created cabinet group: maimai-pair-a');

  console.log('');
  // Point at the production hostname when seeding prod; localhost otherwise.
  // The dev URLs are the same as before; the prod URLs are the ones your QR
  // codes will actually link to.
  const host = isProd ? 'https://app.porta137.com' : 'http://localhost:5173';
  console.log('Your QR codes should link to:');
  console.log(`  ${host}/queue/sound-voltex  (solo)`);
  console.log(`  ${host}/queue/group/maimai-pair-a  (paired duet)`);
  console.log('');
  console.log('Done! You can now start the server.');
  process.exit(0);
}

setup().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
