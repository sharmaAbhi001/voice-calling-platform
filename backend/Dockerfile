# Build context is the repo root: the backend depends on the shared workspace.
FROM node:22-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY agent/package.json agent/
COPY frontend/package.json frontend/
COPY shared ./shared
RUN npm install --workspace shared --workspace backend --include-workspace-root

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
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared ./shared
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/src/database/migrations ./backend/dist/database/migrations
USER node
EXPOSE 4000
CMD ["node", "backend/dist/server.js"]
