# Vercel Migration Runbook

This is the step-by-step guide to cut ArcadeQueue over from the current
self-hosted Docker + Caddy stack to Vercel. The code changes are already in
place — what's left is the dashboard work, DNS, and smoke testing.

**Stack target:** Vercel (Hobby tier — no Pro subscription required).
**Auto-void model:** Lazy-void on every head-touching user request, plus a
small client-side 30s keepalive that pings a new `GET /api/tick` endpoint.
The cabinet's always-on browser acts as the "scheduler," so no Vercel Cron
or external cron service is needed.

---

## 1. Prerequisites

Make sure you have:

- A Vercel account (sign in at [vercel.com](https://vercel.com); the Hobby
  tier is free).
- The GitHub repo (`ArcadeQueue`) connected to your Vercel account. Vercel
  will import it when you click "Add New → Project."
- Access to the DNS records for `porta137.com` (wherever they're managed —
  Cloudflare, Namecheap, Route 53, etc.).
- The contents of `server/.env` from the current VPS — you'll need to copy
  these into Vercel's env-var UI.
- The `firebase-service-account.json` or its individual fields. The server
  uses the individual `FIREBASE_*` env vars (not a JSON blob), so the
  existing `server/.env` is enough.

---

## 2. Create the Vercel project

1. Go to [vercel.com/new](https://vercel.com/new).
2. Import the `ArcadeQueue` GitHub repo.
3. Vercel auto-detects the monorepo layout. Confirm the settings:
   - **Framework Preset:** Vite (the Vercel auto-detect will land on this
     because `client/package.json` has a `vite` build script).
   - **Root Directory:** `./` (the repo root — leave as default).
   - **Build Command:** `npm run build` (Vercel will run the workspace build;
     it understands `workspaces: ["server", "client"]` from the root
     `package.json`).
   - **Output Directory:** `client/dist` (this is what Vite emits).
   - **Install Command:** `npm install` (default).
4. Click **Deploy** — the first build will fail because no env vars are set
   yet. That's expected; we'll set them in step 3, then redeploy.

> If Vercel doesn't auto-detect the SPA + function split correctly, you can
> override the build command in the project settings to:
>
> ```
> npm run build --workspace=client
> ```
>
> and set the output directory to `client/dist`. The `server/index.js` is
> auto-detected as a serverless function from the workspace.

---

## 3. Set environment variables

In the Vercel project dashboard: **Settings → Environment Variables.** Add
the following. For each var, set its scope to **Production**, **Preview**,
and **Development** (or just Production for now — you'll want Preview to
match Production later for testing).

### Client (Vite build-time — exposed to `vite build`)

These bake into the bundle at build time. If you change them you need to
redeploy.

| Variable                         | Value                                  |
| -------------------------------- | -------------------------------------- |
| `VITE_FIREBASE_API_KEY`          | from current `server/.env` (root `.env`) |
| `VITE_FIREBASE_AUTH_DOMAIN`      | `arcadequeue.firebaseapp.com`          |
| `VITE_FIREBASE_PROJECT_ID`       | `arcadequeue`                          |
| `VITE_FIREBASE_STORAGE_BUCKET`   | `arcadequeue.firebasestorage.app`      |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | from current `.env`                |
| `VITE_FIREBASE_APP_ID`           | from current `.env`                    |
| `VITE_API_URL`                   | `https://api.porta137.com`             |

> The Firebase web SDK config is public-by-design (it's shipped to every
> browser). It's safe to commit to `.env.example` and to set in Vercel's
> dashboard. The actual secrets are the Firebase Admin SDK private key and
> the Discord client secret (server-side only).

### Server (function runtime — never exposed to the client)

| Variable                 | Value                                                    |
| ------------------------ | -------------------------------------------------------- |
| `DISCORD_CLIENT_ID`      | from `server/.env`                                      |
| `DISCORD_CLIENT_SECRET`  | from `server/.env`                                      |
| `DISCORD_CALLBACK_URL`   | `https://api.porta137.com/auth/discord/callback`         |
| `SESSION_SECRET`         | from `server/.env` (any random 32+ char string)          |
| `FIREBASE_PROJECT_ID`    | `arcadequeue` (or your project ID)                       |
| `FIREBASE_PRIVATE_KEY_ID`| from `server/.env`                                      |
| `FIREBASE_PRIVATE_KEY`   | from `server/.env` — paste the **multiline PEM** as-is. Vercel supports multiline env values; the `.replace(/\\n/g, '\n')` in `server/index.js:15` normalizes either form on read. |
| `FIREBASE_CLIENT_EMAIL`  | from `server/.env`                                      |
| `FIREBASE_CLIENT_ID`     | from `server/.env`                                      |
| `CLIENT_URL`             | `https://app.porta137.com`                               |
| `NODE_ENV`               | `production`                                             |

> **`FIREBASE_PRIVATE_KEY` paste tip:** Open the value in a text editor
> first, ensure the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE
> KEY-----` markers are intact, and that the actual line breaks are
> preserved. If you copy from a JSON blob, escape the newlines as `\n`
> (literal backslash-n) — both forms are accepted by the existing code.

> **No `CRON_SECRET` is needed anymore.** The earlier design (which
> required a cron job) has been replaced with the lazy-void + keepalive
> model. If you have a stale `CRON_SECRET` from planning notes, don't
> add it.

After saving the env vars, trigger a redeploy from the **Deployments** tab
(use the "..." menu → "Redeploy"). The build should now succeed.

---

## 4. Attach the custom domains

In the Vercel project dashboard: **Settings → Domains.** Add two domains:

- `app.porta137.com` — this is where the SPA lives.
- `api.porta137.com` — this is where the serverless function lives.

Vercel will display a CNAME target for each domain. Go to your DNS
provider and replace the current A/AAAA records (which point to the old
VPS IP) with the Vercel CNAMEs. Example for `app.porta137.com`:

```
Type: CNAME
Name: app
Value: cname.vercel-dns.com
```

> **Important:** Vercel provisions the TLS cert automatically once DNS
> resolves. This usually takes a few minutes. The HTTPS padlock will
> appear in your browser once Vercel confirms the cert.

Both subdomains attach to the same Vercel project. Routing is path-based:

- `app.porta137.com/` → SPA (static)
- `app.porta137.com/api/*` and `/auth/*` → serverless function
- `api.porta137.com/*` → serverless function (whole subdomain)

This means `https://api.porta137.com/auth/discord/callback` resolves to
the function (good — that's the Discord callback URL) **and** the SPA's
calls to `https://api.porta137.com/api/*` resolve to the function too
(good — that's the API base URL).

---

## 5. Discord OAuth settings

No code change here — the existing Discord application's "Redirect URI"
should already be set to `https://api.porta137.com/auth/discord/callback`,
and that exact URL is now served by Vercel. Just confirm it:

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Select your ArcadeQueue application.
3. **OAuth2 → Redirects** — verify `https://api.porta137.com/auth/discord/callback`
   is listed. (If the Discord app still has the old callback URL pointing
   at a different domain, add the Vercel one and remove the old one.)

---

## 6. CORS

No change. The existing `cors({ origin: ['https://app.porta137.com', 'https://api.porta137.com'] })`
in `server/index.js` continues to work because both subdomains are still
the SPA origin and the API origin. The cross-subdomain `__session` cookie
keeps its `SameSite=None; Secure` policy and still works because the
request shape (`app.` → `api.`) is identical to what the old stack served.

---

## 7. Smoke test (preview URL first, then production domain)

Vercel will give you a preview URL on the form
`arcadequeue-<git-hash>-<team-slug>.vercel.app` for every deployment. Use
it for the first end-to-end test before touching DNS.

Run through each of these checks:

- [ ] **1. `curl https://<preview>/healthz`** → `{"ok":true}` — the API
  function is alive.
- [ ] **2. Open `https://<preview>/` in a browser** — the SPA loads, lists
  games (read from Firestore via the Firebase JS SDK).
- [ ] **3. Click "Login with Discord"** — OAuth round-trip lands you back
  logged in. Open DevTools → Application → Cookies and confirm the
  `__session` cookie has `Secure; SameSite=None` and a non-zero
  `Expires / Max-Age`.
- [ ] **4. Join a queue with a second browser/incognito window** — the new
  slot appears in real time in the first browser via the Firestore
  `onSnapshot` listener.
- [ ] **5. Become head of queue (have the incognito user be the only
  player, then a fresh user joins after)** — the readiness banner with a
  60s countdown appears in **both** browsers.
- [ ] **6. Wait ~60s without confirming** — the head slot disappears in
  both browsers (voided by the keepalive → `getHeadSlotLive`). Open
  `https://<preview>/api/tick` in your browser — it returns
  `{"ok":true,"games":N}`. (Visiting the tick URL in the browser
  manually is a way to force an immediate void if you don't want to wait
  for the 30s client poll.)
- [ ] **7. `vercel logs --prod`** — no errors during the smoke test.
  (Install the Vercel CLI: `npm i -g vercel`. Run `vercel login` once.)
- [ ] **8. (Discord verify)** — the developer portal still lists
  `https://api.porta137.com/auth/discord/callback` as a redirect.

Once all eight pass on the preview URL, attach the production custom
domains per step 4, wait for DNS to propagate, and re-run checks 1, 2,
and 3 against the real domain. The cookie issued by the old VPS works
against the Vercel API without re-login (cookie attributes and CORS
allowlist are unchanged).

---

## 8. Set up uptime monitoring (replaces the docker healthcheck)

The `docker-compose.yml` healthcheck is gone with the file. Add an
external monitor:

- **UptimeRobot** (free tier, 5-min interval) or **Better Stack** (free
  tier, 1-min interval) — point it at `https://api.porta137.com/healthz`.
- Use HTTP, expect status 200. No body match needed.

> **Do not poll `/api/tick`** for uptime — it's not a liveness probe
> and would do real work (a Firestore read per game) on every ping.
> `/healthz` is intentionally trivial and returns synchronously.

> **Do not poll faster than once per minute on Vercel.** Every request
> to a serverless function is billable. Once per minute is the
> right cadence for the auto-void; once per 5 minutes is fine for
> uptime alerts.

---

## 9. 24h soak

Before tearing down the VPS, run Vercel for 24h with the new stack and
keep an eye on:

- **`vercel logs --prod`** for unhandled errors or stack traces.
- **Uptime monitor** for `/healthz` — should be 100% green.
- **Discord OAuth** — log in from a fresh browser, confirm a session
  cookie is set and persists across page loads.
- **End-to-end queue flow** — at least one full join → head → confirm-ready
  → done cycle per cabinet type (solo and duet if you have one).
- **Auto-void** — let a head sit unconfirmed for 90s, confirm the slot
  disappears from the queue page. (`/api/tick` is your friend if you
  want to force a faster void for testing.)

---

## 10. Tear down the old stack

After 24h clean:

1. **Delete the Docker artifacts** from the repo:
   ```sh
   git rm Dockerfile docker-compose.yml Caddyfile .dockerignore
   git commit -m "Tear down Docker/Caddy stack — now on Vercel"
   ```
2. **Remove the build env files** (Vercel env supersedes them):
   ```sh
   git rm -f client/.env.production   # the root .env and server/.env
                                       # are already gitignored
   ```
3. **Update DNS** to remove the old A/AAAA records pointing at the VPS
   (the CNAMEs to Vercel from step 4 already replaced them; just make
   sure no AAAA record lingers).
4. **Tear down the VPS** — once you're confident no traffic is hitting
   the old IP.

---

## Appendix A: How the lazy-void works

In the old Docker/Caddy stack, the server had a module-scoped
`Map<gameId, Map<slotId, NodeJS.Timeout>>` and called `setTimeout` to
auto-void each head 60s after its `readyDeadline` was stamped. On Vercel
serverless that map is wiped between invocations, so we use a different
model:

1. **`getHeadSlotLive(gameId)`** (`server/index.js:253-261`) is called on
   every user-driven head-touching request (`/queue/status`, `/queue/done`,
   `/queue/confirm-ready`, `/queue/extend`). If the head's `readyDeadline`
   has passed, it voids the slot and stamps the new head. This is the
   same behavior as the old in-process timer, just lazy.
2. **`GET /api/tick`** (`server/index.js:711-729`) is a new, cheap,
   unauthenticated endpoint that walks every game and calls
   `getHeadSlotLive`. The client polls it every 30s while a queue page
   is open (`client/src/pages/QueuePage.jsx:211-225` and
   `client/src/pages/GroupQueuePage.jsx:210-220`).
3. **The cabinet's always-on browser** is the "scheduler." As long as
   the cabinet screen or any player's phone has a queue page open, the
   server gets pinged every 30s and any expired head is voided.
4. **Failure mode:** a queue with no open browsers sits un-voided until
   someone loads the page. For an arcade app this is fine — the cabinet
   screen is always on, and any new player will trigger the void on
   their first API call.

**Why this is safe:** the `readyDeadline` is the single source of truth,
stored in Firestore. The cron-like behavior is purely a side-effect of
clients pinging. The lazy check itself is race-free because Firestore
transactions are atomic (the `delete` is straightforward — no concurrent
writers).

**Why this is on Hobby:** no scheduler of any kind is required, so we
stay under the Hobby plan's "no sub-day cron" limit. Zero third-party
dependencies added.

---

## Appendix B: Rollback plan

If something goes wrong in production:

1. **DNS rollback** is the fastest path. Re-point the CNAMEs back at
   the old VPS IP and the old Caddy stack takes over within minutes
   (subject to TTL).
2. **Vercel rollback** — in the Vercel dashboard, find a previous
   successful deploy and click "Promote to Production." This swaps the
   function at the URL without DNS changes.
3. **Code rollback** — the Docker files (`Dockerfile`,
   `docker-compose.yml`, `Caddyfile`) are not deleted until step 10.
   As long as the VPS is still running, you can `git revert` the code
   changes and `docker compose build && up` to restore the old stack.

---

## Appendix C: Useful commands

```sh
# Watch live production logs
vercel logs --prod --follow

# Pull production env into a local .env.production for the seed script
vercel env pull .env.production

# Run the one-off admin seed against the live Firestore project
NODE_ENV=production npm run seed:prod

# Force a void right now (bypasses the 30s keepalive)
curl https://api.porta137.com/api/tick
```

---

## Files touched by the migration (already committed)

| File                                       | Change                                                  |
| ------------------------------------------ | ------------------------------------------------------- |
| `server/index.js`                          | Wrapped `firebase-admin` init in `globalThis`; deleted in-process timer map; added `GET /api/tick`; exports `app` for Vercel. |
| `client/src/lib/api.js`                    | Added `api.tick()` helper.                              |
| `client/src/pages/QueuePage.jsx`           | Added 30s `setInterval` keepalive effect.               |
| `client/src/pages/GroupQueuePage.jsx`      | Added 30s `setInterval` keepalive effect.               |

No other files were changed. `vercel.json` is intentionally absent (the
Hobby-tier lazy-void model needs no cron declaration).
