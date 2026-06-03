/**
 * Run this once to seed your Firebase with the SOUND VOLTEX game entry.
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
  console.log('Setting up SDVX Queue Firebase...');

  await db.collection('games').doc('sound-voltex').set({
    name: 'SOUND VOLTEX',
    subtitle: 'EXCEED GEAR',
    description: 'Konami\'s rhythm game featuring a unique 6-button + knob controller.',
    cabinetNumber: 1,
    location: 'Main Floor',
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log('✅ Created game: sound-voltex');
  console.log('');
  console.log('Your QR code should link to:');
  console.log('  http://localhost:5173/queue/sound-voltex');
  console.log('');
  console.log('Done! You can now start the server.');
  process.exit(0);
}

setup().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
