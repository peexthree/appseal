#!/bin/bash
# Start the demo vulnerable app (port 3210) in background with auto-reload
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/mini-services/demo-app" || exit 1
# node 22+ runs TS via --experimental-strip-types; older setups fall back to bun
if node --experimental-strip-types --version >/dev/null 2>&1; then
  nohup node --experimental-strip-types index.ts > demo.log 2>&1 &
else
  nohup bun --hot index.ts > demo.log 2>&1 &
fi
echo $! > demo.pid
sleep 1
curl -s -o /dev/null -w "demo app status: %{http_code}\n" http://127.0.0.1:3210/
