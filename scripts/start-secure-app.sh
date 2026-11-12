#!/bin/bash
# Start the secure demo app (port 3211, HTTPS) in background with auto-reload
cd /home/z/my-project/mini-services/secure-app
nohup bun --hot index.ts > /home/z/my-project/mini-services/secure-app/secure.log 2>&1 &
echo $! > /home/z/my-project/mini-services/secure-app/secure.pid
sleep 1
curl -s --cacert certs/ca.crt -o /dev/null -w "secure app status: %{http_code}\n" https://127.0.0.1:3211/
