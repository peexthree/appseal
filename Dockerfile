# AppMOT - production image (Next.js standalone output)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -S appmot && adduser -S appmot -G appmot
# standalone build already contains .next/static, public and assets/fonts
COPY --from=builder /app/.next/standalone ./
USER appmot
EXPOSE 3000
# scans (db/scans) and the public registry (db/registry.json) live under
# /app/db - mount a volume here for persistence across container restarts
VOLUME ["/app/db"]
# liveness probe: the /api/healthz endpoint answers 200 JSON without secrets
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://localhost:3000/api/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
