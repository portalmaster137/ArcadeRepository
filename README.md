# 🎮 Arcade Queue System

A real-time queue app for arcade cabinets. Players scan a QR code to join the queue, log in with Discord, and get live updates when their turn is coming up.

## Stack

- **Frontend**: React + Vite (real-time Firestore listener)
- **Backend**: Node.js + Express (session auth, API)
- **Auth**: Discord OAuth 2.0 via Passport.js
- **Database**: Firebase Firestore (real-time, free tier)

---

## Setup Guide

### 1. Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a new project
3. Go to **Firestore Database** → Create database → Start in production mode
4. Add this security rule (allows reads, but only authenticated server can write):
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read: if true;
         allow write: if false;
       }
     }
   }
   ```
5. Go to **Project Settings** → **Service accounts** → **Generate new private key**
   - This gives you a JSON file — you'll need values from it for the server `.env`
6. Go to **Project Settings** → **Your apps** → Add a Web app
   - Copy the `firebaseConfig` values for the client `.env`

### 2. Discord Application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Create a new application
3. Go to **OAuth2** tab
4. Add redirect URL: `http://localhost:3001/auth/discord/callback`
   - For production: `https://yourdomain.com/auth/discord/callback`
5. Copy **Client ID** and **Client Secret**

### 3. Server Environment

```bash
cd server
cp .env.example .env
```

Fill in your `.env`:

```env
DISCORD_CLIENT_ID=       # from Discord dev portal
DISCORD_CLIENT_SECRET=   # from Discord dev portal
DISCORD_CALLBACK_URL=http://localhost:3001/auth/discord/callback
SESSION_SECRET=some-very-long-random-string-here

FIREBASE_PROJECT_ID=     # from service account JSON: project_id
FIREBASE_PRIVATE_KEY_ID= # from service account JSON: private_key_id
FIREBASE_PRIVATE_KEY=    # from service account JSON: private_key (keep the quotes)
FIREBASE_CLIENT_EMAIL=   # from service account JSON: client_email
FIREBASE_CLIENT_ID=      # from service account JSON: client_id

PORT=3001
CLIENT_URL=http://localhost:5173
NODE_ENV=development
```

### 4. Client Environment

```bash
cd client
cp .env.example .env
```

Fill in `.env` with your Firebase web app config:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_API_URL=http://localhost:3001
```

### 5. Install & Seed

```bash
# Install all dependencies
npm install

# Seed Firebase with the SOUND VOLTEX game entry
cd server && node setup-firebase.js
```

### 6. Run

```bash
# From root — starts both server and client
npm run dev
```

- App: http://localhost:5173
- API: http://localhost:3001
- Queue URL: http://localhost:5173/queue/sound-voltex

---

## Adding More Games

```bash
# POST to the API to create a new game
curl -X POST http://localhost:3001/api/games \
  -H "Content-Type: application/json" \
  -d '{"id":"beatmania-iidx","name":"beatmania IIDX","subtitle":"RESIDENT","cabinetNumber":2,"location":"Main Floor"}'
```

Then generate a QR code pointing to `/queue/beatmania-iidx`.

---

## QR Code Printing

The home page (`/`) shows the QR code for SOUND VOLTEX.
For a print-friendly version, just screenshot or use any QR generator pointed at:
```
https://yourdomain.com/queue/sound-voltex
```

---

## Production Deployment

1. Build the client: `npm run build` (outputs to `client/dist`)
2. Serve `client/dist` as static files from Express or a CDN
3. Set `NODE_ENV=production` and update all URLs
4. Add your production domain to Discord's OAuth redirect URLs
5. Consider using `connect-session-firebase` for persistent sessions

---

## Project Structure

```
sdvx-queue/
├── server/
│   ├── index.js          # Express server, auth, queue API
│   ├── setup-firebase.js # One-time DB seeding
│   ├── .env.example
│   └── package.json
└── client/
    ├── src/
    │   ├── lib/
    │   │   ├── firebase.js   # Firestore client
    │   │   └── api.js        # API helpers
    │   ├── hooks/
    │   │   ├── useAuth.js    # Discord session state
    │   │   └── useQueue.js   # Real-time Firestore listener
    │   ├── components/
    │   │   ├── NavBar.jsx
    │   │   ├── QueueEntry.jsx
    │   │   ├── PlayerControls.jsx
    │   │   ├── QRCode.jsx
    │   │   └── Toast.jsx
    │   ├── pages/
    │   │   ├── HomePage.jsx  # Landing + QR display
    │   │   └── QueuePage.jsx # Main queue view
    │   └── index.css         # Neon arcade theme
    ├── index.html
    ├── vite.config.js
    ├── .env.example
    └── package.json
```
