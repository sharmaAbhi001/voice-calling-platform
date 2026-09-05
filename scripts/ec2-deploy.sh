#!/usr/bin/env bash
# Runs ON the EC2 instance, invoked by GitHub Actions through SSM Run Command.
# The workflow drops this file and docker-compose.prod.yml into /opt/voiceagent
# first, then executes it with ECR_REGISTRY / IMAGE_TAG / AWS_REGION exported.
set -euo pipefail

APP_DIR=/opt/voiceagent
cd "$APP_DIR"

: "${ECR_REGISTRY:?ECR_REGISTRY is required}"
: "${IMAGE_TAG:?IMAGE_TAG is required}"
: "${AWS_REGION:?AWS_REGION is required}"

# The application secrets are placed on the instance once, by hand, and are never
# stored in GitHub. A missing file means every container would boot with an
# invalid config, so fail loudly instead.
if [ ! -f "$APP_DIR/.env" ]; then
  echo "FATAL: $APP_DIR/.env is missing. Create it once - see docs/DEPLOY-EC2.md." >&2
  exit 1
fi

echo "==> Logging in to ECR"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"

export ECR_REGISTRY IMAGE_TAG

echo "==> Pulling images at tag $IMAGE_TAG"
docker compose pull

echo "==> Starting database"
docker compose up -d postgres

echo "==> Waiting for Postgres to accept connections"
for _ in $(seq 1 60); do
  health=$(docker inspect --format '{{.State.Health.Status}}' \
    "$(docker compose ps -q postgres)" 2>/dev/null || echo starting)
  [ "$health" = "healthy" ] && break
  sleep 2
done
if [ "${health:-}" != "healthy" ]; then
  echo "FATAL: Postgres did not become healthy" >&2
  docker compose logs --tail 50 postgres >&2
  exit 1
fi

# Forward-only Prisma migrations, applied before the new code serves traffic.
# The entry point wraps `prisma migrate deploy`, and baselines a database that
# predates Prisma on its first run - see backend/prisma/README.md.
# --no-deps because Postgres is already up and the backend image would otherwise
# drag the whole dependency chain into this one-shot container.
echo "==> Applying migrations"
docker compose run --rm --no-deps backend node backend/dist/database/migrate.js

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "==> Seeding (admin user, demo knowledge base, templates)"
  docker compose run --rm --no-deps backend node backend/dist/database/seed.js
fi

echo "==> Rolling out"
docker compose up -d --remove-orphans

# The agent image is large; without this the root volume fills up after a dozen
# deploys. Only untagged/superseded layers older than the current release go.
docker image prune -af --filter 'until=72h' >/dev/null 2>&1 || true

echo "==> Done"
docker compose ps
