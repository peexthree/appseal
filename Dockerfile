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
# scans are stored as JSON files under /app/db/scans - mount a volume here
# for persistence across container restarts
VOLUME ["/app/db/scans"]
CMD ["node", "server.js"]
