/**
 * Run this once to seed your Firebase with the games and cabinet groups.
 * Usage: node setup-firebase.js
 */
require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

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
  console.log('Your QR codes should link to:');
  console.log('  http://localhost:5173/queue/sound-voltex  (solo)');
  console.log('  http://localhost:5173/queue/group/maimai-pair-a  (paired duet)');
  console.log('');
  console.log('Done! You can now start the server.');
  process.exit(0);
}

setup().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
