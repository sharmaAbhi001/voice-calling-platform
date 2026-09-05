# Build context is the repo root: the backend depends on the shared workspace.
FROM node:22-slim AS base
WORKDIR /app
# openssl is what the Prisma query engine links against at runtime; ca-certificates
# is needed for outbound TLS.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY agent/package.json agent/
COPY frontend/package.json frontend/
COPY shared ./shared
# The schema is copied before the install so the backend's postinstall hook can
# generate the client, and before the sources so a code-only change reuses this
# layer. The client lands in node_modules/.prisma, inherited by every stage below.
COPY backend/prisma ./backend/prisma
RUN npm install --workspace shared --workspace backend --include-workspace-root \
  && npx prisma generate --schema backend/prisma/schema.prisma

FROM base AS development
COPY backend ./backend
ENV NODE_ENV=development
EXPOSE 4000
CMD ["npm", "run", "dev", "-w", "backend"]

FROM base AS build
COPY backend ./backend
RUN npm run build -w backend

FROM node:22-slim AS production
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*
# Carries the generated Prisma client and its query engine, plus the Prisma CLI
# that `dist/database/migrate.js` shells out to on deploy.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared ./shared
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/package.json ./backend/package.json
# Schema and migrations: `prisma migrate deploy` reads both at runtime.
COPY --from=build /app/backend/prisma ./backend/prisma
USER node
EXPOSE 4000
CMD ["node", "backend/dist/server.js"]
