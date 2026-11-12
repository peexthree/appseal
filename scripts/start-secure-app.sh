#!/bin/bash
# Start the secure demo app (port 3211, HTTPS) in background with auto-reload
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/mini-services/secure-app" || exit 1
# node 22+ runs TS via --experimental-strip-types; older setups fall back to bun
if node --experimental-strip-types --version >/dev/null 2>&1; then
  nohup node --experimental-strip-types index.ts > secure.log 2>&1 &
else
  nohup bun --hot index.ts > secure.log 2>&1 &
fi
echo $! > secure.pid
sleep 1
curl -s --cacert certs/ca.crt -o /dev/null -w "secure app status: %{http_code}\n" https://127.0.0.1:3211/
