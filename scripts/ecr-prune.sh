#!/usr/bin/env bash
# Deletes old images from the three voiceops ECR repositories, keeping the N most
# recent plus anything tagged "latest". Run it from a machine with AWS access.
#
#   ./scripts/ecr-prune.sh            # dry run, shows what would go
#   ./scripts/ecr-prune.sh --apply    # actually delete
#   KEEP=3 ./scripts/ecr-prune.sh --apply
#
# The tag currently deployed on EC2 must never be deleted: a container restart
# would fail to pull. Pass it in so the script protects it:
#
#   PROTECT_TAG=$(ssh-or-ssm 'docker inspect ... ') ./scripts/ecr-prune.sh --apply
set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
KEEP="${KEEP:-5}"
PROTECT_TAG="${PROTECT_TAG:-}"
REPOS=(voiceops-backend voiceops-agent voiceops-frontend)
APPLY=false
[ "${1:-}" = "--apply" ] && APPLY=true

for repo in "${REPOS[@]}"; do
  echo "==> $repo"

  # Newest first, so everything past the first $KEEP is a deletion candidate.
  mapfile -t candidates < <(
    aws ecr describe-images --repository-name "$repo" --region "$REGION" \
      --query "reverse(sort_by(imageDetails,&imagePushedAt))[${KEEP}:].imageTags[0]" \
      --output text 2>/dev/null | tr '\t' '\n' | grep -v '^None$' || true
  )

  if [ "${#candidates[@]}" -eq 0 ]; then
    echo "    nothing older than the newest $KEEP"
    continue
  fi

  for tag in "${candidates[@]}"; do
    # Braces matter: `A || B && C` groups as `(A || B) && C` in sh, which would
    # let "latest" through to deletion whenever PROTECT_TAG is unset.
    if [ "$tag" = 'latest' ] || { [ -n "$PROTECT_TAG" ] && [ "$tag" = "$PROTECT_TAG" ]; }; then
      echo "    keep   $tag (protected)"
      continue
    fi
    if $APPLY; then
      aws ecr batch-delete-image --repository-name "$repo" --region "$REGION" \
        --image-ids "imageTag=$tag" >/dev/null
      echo "    delete $tag"
    else
      echo "    would delete $tag"
    fi
  done

  # Layers left behind once no tag references them. Always safe to remove.
  if $APPLY; then
    aws ecr list-images --repository-name "$repo" --region "$REGION" \
      --filter tagStatus=UNTAGGED --query 'imageIds[*]' --output json > /tmp/untagged.json
    if [ "$(tr -d '[:space:]' < /tmp/untagged.json)" != '[]' ]; then
      aws ecr batch-delete-image --repository-name "$repo" --region "$REGION" \
        --image-ids file:///tmp/untagged.json >/dev/null
      echo "    deleted untagged layers"
    fi
  fi
done

$APPLY || echo
$APPLY || echo "Dry run. Re-run with --apply to delete."
