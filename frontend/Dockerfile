FROM node:22-slim AS base
WORKDIR /app
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY agent/package.json agent/
COPY frontend/package.json frontend/
COPY shared ./shared
RUN npm install --workspace shared --workspace frontend --include-workspace-root

FROM base AS development
COPY frontend ./frontend
EXPOSE 5173
CMD ["npm", "run", "dev", "-w", "frontend", "--", "--host", "0.0.0.0"]

FROM base AS build
COPY frontend ./frontend
COPY .env* ./
# Vite inlines this at build time, so it is an image property, not a runtime one.
# The default is relative: nginx in the production stage proxies /api to the
# backend, which keeps the bundle independent of the host's address.
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build -w frontend

FROM nginx:1.27-alpine AS production
COPY docker/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
