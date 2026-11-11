#!/bin/bash
# Start the demo vulnerable app (port 3210) in background with auto-reload
cd /home/z/my-project/mini-services/demo-app
nohup bun --hot index.ts > /home/z/my-project/mini-services/demo-app/demo.log 2>&1 &
echo $! > /home/z/my-project/mini-services/demo-app/demo.pid
sleep 1
curl -s -o /dev/null -w "demo app status: %{http_code}\n" http://127.0.0.1:3210/
