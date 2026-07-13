# ---- Build stage: compile server + web from the monorepo ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci

COPY . .
RUN npm run build -w server && npm run build -w web

# ---- Runtime stage: minimal image running the API (serves web/dist) ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci --omit=dev

# Schema + migrations (for `migrate deploy` at boot) and built artifacts.
COPY server/prisma ./server/prisma
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/web/dist ./web/dist
COPY prototype ./prototype
COPY docker/entrypoint.sh ./docker/entrypoint.sh
# Generate the Prisma client from the copied schema, then prep uploads dir.
RUN cd server && npx prisma generate \
  && cd /app && chmod +x ./docker/entrypoint.sh && mkdir -p server/uploads

EXPOSE 4000
ENTRYPOINT ["./docker/entrypoint.sh"]
