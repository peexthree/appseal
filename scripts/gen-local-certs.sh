#!/bin/bash
# Generate a local CA + server certificate for the AppMOT secure demo app.
# The CA is trusted by the Next.js dev server via NODE_EXTRA_CA_CERTS,
# so the scanner can fetch https://127.0.0.1:3211 like a real production site.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)/mini-services/secure-app/certs"
mkdir -p "$DIR"
cd "$DIR"

if [ -f server.crt ] && [ -f ca.crt ]; then
  echo "certs already exist in $DIR"
  exit 0
fi

# 1) Local CA (10 years)
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout ca.key -out ca.crt \
  -subj "/CN=AppMOT Local CA/O=AppMOT Demo" \
  -days 3650 >/dev/null 2>&1

# 2) Server key + CSR
openssl req -newkey rsa:2048 -nodes \
  -keyout server.key -out server.csr \
  -subj "/CN=127.0.0.1/O=AppMOT Secure Demo" >/dev/null 2>&1

# 3) Sign with the CA (2.5 years, SAN: IP + localhost)
printf "subjectAltName=IP:127.0.0.1,DNS:localhost\n" > san.ext
openssl x509 -req -in server.csr \
  -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days 900 -extfile san.ext >/dev/null 2>&1

echo "generated:"
ls -la "$DIR" | grep -E "crt|key"
