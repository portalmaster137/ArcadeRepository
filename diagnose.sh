#!/bin/bash
  # diagnose.sh — Run this on the production server to trace the full build
  # pipeline. Paste output back to me.
  set +e  # don't abort on errors — we want to see everything

  echo "════════════════════════════════════════════════════════════════"
  echo " 1. WHERE IS CADDY READING FROM?"
  echo "════════════════════════════════════════════════════════════════"
  grep -n "root\|file_server" /etc/caddy/Caddyfile 2>/dev/null \
    || grep -n "root\|file_server" ~/Caddyfile 2>/dev/null \
    || find / -name "Caddyfile" -not -path "/proc/*" 2>/dev/null | head -5 | xargs -I {} sh -c 'echo "--- {} ---"; grep -n "root\|file_server\|api" {}'

  echo
  echo "════════════════════════════════════════════════════════════════"
  echo " 2. WHAT'S IN /data/ArcadeQueueClient (Caddy's root)?"
  echo "════════════════════════════════════════════════════════════════"
  ls -la /data/ArcadeQueueClient/ 2>&1
  echo "--- /data/ArcadeQueueClient/assets/ ---"
  ls -la /data/ArcadeQueueClient/assets/ 2>&1
  echo "--- index.html in that dir ---"
  cat /data/ArcadeQueueClient/index.html 2>&1 | head -20

  echo
  echo "════════════════════════════════════════════════════════════════"
  echo " 3. WHAT'S IN /hive/nucleus/caddy_mount/ArcadeQueueClient (the bind mount target)?"
  echo "════════════════════════════════════════════════════════════════"
  ls -la /hive/nucleus/caddy_mount/ArcadeQueueClient/ 2>&1
  echo "--- assets/ ---"
  ls -la /hive/nucleus/caddy_mount/ArcadeQueueClient/assets/ 2>&1
  echo "--- index.html ---"
  cat /hive/nucleus/caddy_mount/ArcadeQueueClient/index.html 2>&1 | head -20

  echo
  echo "════════════════════════════════════════════════════════════════"
  echo " 4. ARE THE TWO PATHS THE SAME FILES (or linked)?"
  echo "════════════════════════════════════════════════════════════════"
  stat -c "%i %n" /data/ArcadeQueueClient/index.html 2>/dev/null
  stat -c "%i %n" /hive/nucleus/caddy_mount/ArcadeQueueClient/index.html 2>/dev/null
  echo "If the inode numbers (%i) match, they're the same file. If they don't, they're independent."

  echo
  echo "════════════════════════════════════════════════════════════════"
  echo " 5. IS THE SERVED BUNDLE THE NEW (working) ONE?"
  echo "════════════════════════════════════════════════════════════════"
  BUNDLE_PATH=$(ls /data/ArcadeQueueClient/assets/index-*.js 2>/dev/null | head -1)
  echo "Bundle on disk: $BUNDLE_PATH"
  if [ -n "$BUNDLE_PATH" ]; then
    echo "  Firebase config check:"
    grep -oE 'apiKey:(void 0|"AIza[^"]*")' "$BUNDLE_PATH" | head -3
    echo "  Has real Firebase key?"
    grep -c "AIzaSyA10_0s2B" "$BUNDLE_PATH"
  fi
  echo "  Caddy is serving:"
  curl -sI https://app.porta137.com/ 2>&1 | head -3
  LIVE_BUNDLE=$(curl -s https://app.porta137.com/ 2>&1 | grep -oE '/assets/index-[^"]+\.js' | head -1)
  echo "  Live index.html points to: $LIVE_BUNDLE"
  echo "  That bundle's Firebase config:"
  curl -s "https://app.porta137.com$LIVE_BUNDLE" 2>&1 | grep -oE 'apiKey:(void 0|"AIza[^"]*")' | head -3
  echo "  Has real Firebase key in served bundle?"
  curl -s "https://app.porta137.com$LIVE_BUNDLE" 2>&1 | grep -c "AIzaSyA10_0s2B"

  echo
  echo "════════════════════════════════════════════════════════════════"
  echo " 6. DOCKER: what image is running, when was it built?"
  echo "════════════════════════════════════════════════════════════════"
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.CreatedAt}}\t{{.Status}}' 2>&1
  echo
  echo "Image history (last 5 layers):"
  docker history arcadequeue-api --no-trunc 2>&1 | head -10

  echo
  echo "════════════════════════════════════════════════════════════════"
  echo " 7. INSIDE THE API CONTAINER: where is /app/client/dist?"
  echo "════════════════════════════════════════════════════════════════"
  CID=$(docker ps -q -f name=arcadequeue-api 2>/dev/null | head -1)
  if [ -n "$CID" ]; then
    echo "Container: $CID"
    echo "--- /app/client/dist on the host (should equal bind mount target) ---"
    ls -la /app/client/dist 2>&1 | head -5
    echo "--- inside the container, /app/client/dist ---"
    docker exec "$CID" ls -la /app/client/dist 2>&1 | head -5
    echo "--- inside the container, /app/client/dist/assets ---"
    docker exec "$CID" ls -la /app/client/dist/assets 2>&1 | head -5
  else
    echo "Could not find running container named 'arcadequeue-api'. Listing all:"
    docker ps -a 2>&1
  fi

  echo
  echo "════════════════════════════════════════════════════════════════"
  echo " 8. WHAT ENV WERE THE FIREBASE VARS AT BUILD TIME?"
  echo "════════════════════════════════════════════════════════════════"
  echo "--- env | grep VITE_FIREBASE (current shell) ---"
  env | grep VITE_FIREBASE
  echo
  echo "--- docker compose config (resolved args) ---"
  docker compose config 2>&1 | grep -A 1 -E "VITE_FIREBASE|args:" | head -20

  echo
  echo "════════════════════════════════════════════════════════════════"
  echo " 9. WHAT'S THE LATEST DIST PRODUCED BY A FRESH BUILD?"
  echo "════════════════════════════════════════════════════════════════"
  echo "Doing a quick local-style build to compare hashes..."
  TMPDIR=$(mktemp -d)
  cp /home/porta/Code/ArcadeQueue/client/.env "$TMPDIR/.env" 2>/dev/null && echo "  .env copied" || echo "  (no .env to copy — local build would also be broken)"
  cd /home/porta/Code/ArcadeQueue
  # Use the same Node/Vite as the build would
  docker run --rm -v "$PWD/client":/src -w /src node:20-alpine sh -c '
    if [ -f .env ]; then export $(cat .env | xargs); fi
    echo "VITE_FIREBASE_API_KEY set? $([ -n "$VITE_FIREBASE_API_KEY" ] && echo yes || echo NO)"
    npm ci --no-audit --no-fund --silent 2>&1 | tail -3
    npm run build 2>&1 | tail -5
    echo "--- Fresh build outputs ---"
    ls -la dist/assets/
    echo "--- Has real key? ---"
    grep -c "AIzaSyA10_0s2B" dist/assets/index-*.js
    echo "--- Still has void 0 block? ---"
    grep -c "apiKey:void 0,authDomain:void 0,projectId:void 0" dist/assets/index-*.js
  ' 2>&1 | tail -30

  echo
  echo "════════════════════════════════════════════════════════════════"                                                                                                                                                 
  echo "10. SUMMARY"
  echo "════════════════════════════════════════════════════════════════"
  echo "Caddy root:                 /data/ArcadeQueueClient"
  echo "Docker bind mount target:   /hive/nucleus/caddy_mount/ArcadeQueueClient"
  echo "If these are not the same path, the freshly built bundle never reaches Caddy."
