# GO HR web app — one image for every customer (runtime config via environment variables)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# "npm ci" runs the postinstall script (scripts/copy-face-models.mjs) — it must exist in this stage or the build stops
COPY scripts/copy-face-models.mjs ./scripts/copy-face-models.mjs
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# face models are committed under public/models/face; this re-copies them from node_modules if a file is missing
RUN node scripts/copy-face-models.mjs && npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 TZ=Asia/Bangkok
RUN apk add --no-cache tzdata && addgroup -S app && adduser -S app -G app
COPY --from=build /app/public ./public
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/public/health >/dev/null || exit 1
CMD ["node", "server.js"]
