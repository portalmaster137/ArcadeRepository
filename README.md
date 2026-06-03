# 🎮 Arcade Queue System

A real-time queue app for arcade cabinets. Players scan a QR code to join the queue, log in with Discord, and get live updates when their turn is coming up — including a flashy 60-second readiness timer at the head of the queue with a one-shot 2-minute extension.

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
4. Apply the security rules from `firestore.rules` at the repo root (allows reads, blocks client writes; all mutations come from the server via the Admin SDK):
   ```bash
   firebase deploy --only firestore:rules
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

## Production Deployment (porta137.com)

The app is deployed as a Dockerized stack: a Caddy container terminates TLS and serves the built React client, and an `api` container runs the Express server. Caddy auto-provisions Let's Encrypt certs.

**Architecture:**

```
app.porta137.com  →  Caddy  →  /srv   (built SPA)
api.porta137.com  →  Caddy  →  api:3001  (Express + Firestore)
```

Sessions persist in the Firestore `sessions` collection via a small custom `express-session` Store in `server/session-store.js` — no further setup needed.

### One-time setup

**1. DNS.** At your domain registrar, add two CNAMEs pointing to the host you'll deploy to:
- `app.porta137.com` → `<your-host>`
- `api.porta137.com` → `<your-host>`

**2. Host.** A Linux box with Docker + docker-compose installed. Open TCP 80 and 443. Caddy binds both; nothing else does.

**3. Rotate secrets.** Before the first deploy, generate fresh values for production:
```bash
# New session signing key
openssl rand -hex 32
```
- In the [Discord developer portal](https://discord.com/developers/applications), add a new OAuth redirect: `https://api.porta137.com/auth/discord/callback`. Keep the existing `http://localhost:3001/...` redirect for local dev.
- Generate a new Firebase service account key (`Project Settings → Service accounts → Generate new private key`). Use the new JSON for the production `.env`.

**4. Fill in `server/.env` for production:**
```env
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_CALLBACK_URL=https://api.porta137.com/auth/discord/callback
SESSION_SECRET=<paste the openssl rand -hex 32 output>

FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY_ID=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=
FIREBASE_CLIENT_ID=

PORT=3001
CLIENT_URL=https://app.porta137.com
NODE_ENV=production
```
`CLIENT_URL` may be a comma-separated list (e.g. `https://app.porta137.com,http://localhost:5173` for staging).

**5. Deploy Firestore rules** (one-time, from your local dev box):
```bash
npm install -g firebase-tools   # if not already
firebase login
firebase use --add <your-project-id>
firebase deploy --only firestore:rules
```

**6. Seed production data.** The seed script has a guard: it requires both `NODE_ENV=production` AND an explicit `--confirm-prod` flag. Re-running it overwrites fields on the seeded games/groups — don't do that casually.
```bash
NODE_ENV=production npm run seed:prod
# Equivalent: NODE_ENV=production node server/setup-firebase.js --confirm-prod
```

### Deploying

**7. Bring up the stack:**
```bash
docker compose up -d --build
docker compose logs -f api    # confirm the API started cleanly
```
Caddy will obtain Let's Encrypt certs on first request. Watch the caddy logs to confirm:
```bash
docker compose logs -f caddy
```

**8. Verify:**
- `https://app.porta137.com/` → home page
- `https://app.porta137.com/queue/sound-voltex` → queue page (SPA fallback should work on hard refresh)
- `https://api.porta137.com/healthz` → `{"ok":true}`
- Discord login → callback lands on `https://api.porta137.com/auth/discord/callback` → redirects to `https://app.porta137.com/?login=success`
- Reload — still logged in (session cookie works across subdomains)
- Join a queue, see the 60s readiness banner, confirm — slot transitions to `playing`

**9. Subsequent deploys** (code changes only):
```bash
git pull
docker compose up -d --build
```

### Optional but recommended

- Point an uptime monitor (UptimeRobot, BetterStack, etc.) at `https://api.porta137.com/healthz`. Docker's built-in healthcheck pings it every 30s; an external monitor alerts you if the whole stack is down.
- Set up Firestore backups (Firebase Console → Firestore → Backups). The seed script can recreate games/groups, but live queue state, sessions, and user records are not backed up anywhere else.

---

## Project Structure

```
arcadequeue/
├── Dockerfile              # Multi-stage: builds client, packages api + caddy
├── docker-compose.yml      # Runs the api + caddy services
├── Caddyfile               # app.* static + api.* reverse-proxy
├── firestore.rules         # Firestore security rules (deploy with `firebase deploy`)
├── firebase.json           # Firebase CLI config
├── .dockerignore
├── server/
│   ├── index.js            # Express server, auth, queue API
│   ├── session-store.js    # Custom Firestore-backed express-session store
│   ├── setup-firebase.js   # One-time DB seeding (with prod guard)
│   ├── .env.example
│   └── package.json
└── client/
    ├── src/
    │   ├── lib/
    │   │   ├── firebase.js   # Firestore client
    │   │   └── api.js        # API helpers
    │   ├── hooks/
    │   │   ├── useAuth.js    # Discord session state
    │   │   ├── useGames.js   # Live games collection
    │   │   └── useQueue.js   # Real-time Firestore listener
    │   ├── components/
    │   │   ├── NavBar.jsx
    │   │   ├── QueueEntry.jsx
    │   │   ├── PlayerControls.jsx
    │   │   ├── ReadyBanner.jsx
    │   │   ├── QRCode.jsx
    │   │   └── Toast.jsx
    │   ├── pages/
    │   │   ├── HomePage.jsx      # Landing + QR display
    │   │   ├── QueuePage.jsx     # Main queue view
    │   │   └── GroupQueuePage.jsx# Paired-cabinet group view
    │   └── index.css             # Neon arcade theme
    ├── index.html
    ├── vite.config.js
    ├── .env.example
    └── package.json
```
