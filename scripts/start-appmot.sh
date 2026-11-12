#!/bin/bash
# Start the AppMOT web app (Next.js dev server, port 3000) - same launch
# pattern as the mini-services so it survives across tool calls.
# The local CA is trusted so the scanner can fetch https://127.0.0.1:3211.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
pkill -f "next dev" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
sleep 1
NODE_EXTRA_CA_CERTS="$ROOT/mini-services/secure-app/certs/ca.crt" \
  nohup node node_modules/next/dist/bin/next dev -p 3000 > dev.log 2>&1 &
echo $! > appmot.pid
for i in $(seq 1 30); do
  sleep 1
  code=$(curl -s -o /dev/null --max-time 3 -w "%{http_code}" http://127.0.0.1:3000/ 2>/dev/null)
  if [ "$code" = "200" ]; then
    echo "appmot up: http://127.0.0.1:3000/ (pid $(cat appmot.pid))"
    exit 0
  fi
done
echo "appmot failed to start; last code=$code"
tail -5 dev.log
exit 1
