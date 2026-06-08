#!/bin/bash
set -e

# Mirrors a Vector image from Docker Hub into our private ECR repo. Run this
# whenever we want to use a new upstream Vector version, then update the tag
# in server/docker-compose.yml and .github/workflows/clojure.yml.
#
# Usage:
#   ./scripts/mirror_vector.sh --version 0.56.0-alpine

ecr_account=597134865416
ecr_region=us-east-1
ecr_repo=instant-vector
upstream=timberio/vector
version=

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --version) version="$2"; shift ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
  shift
done

if [ -z "$version" ]; then
  echo "Usage: $0 --version <upstream-tag>  (e.g. 0.56.0-alpine)" >&2
  exit 1
fi

registry="${ecr_account}.dkr.ecr.${ecr_region}.amazonaws.com"
target="${registry}/${ecr_repo}:${version}"

echo "Mirroring ${upstream}:${version} -> ${target}"

# Create the repo if it doesn't already exist.
if ! aws ecr describe-repositories \
       --region "$ecr_region" \
       --repository-names "$ecr_repo" >/dev/null 2>&1; then
  echo "Creating ECR repo $ecr_repo..."
  aws ecr create-repository \
    --region "$ecr_region" \
    --repository-name "$ecr_repo" \
    --image-tag-mutability IMMUTABLE >/dev/null
fi

# Log docker into ECR.
aws ecr get-login-password --region "$ecr_region" \
  | docker login --username AWS --password-stdin "$registry"

docker pull "${upstream}:${version}"
docker tag "${upstream}:${version}" "$target"
docker push "$target"

# Print the digest so callers can pin to it if they want.
digest=$(aws ecr describe-images \
  --region "$ecr_region" \
  --repository-name "$ecr_repo" \
  --image-ids imageTag="$version" \
  --query 'imageDetails[0].imageDigest' \
  --output text)

echo
echo "Mirrored: $target"
echo "Digest:   $digest"
echo
echo "To use the digest-pinned form, reference:"
echo "  ${registry}/${ecr_repo}@${digest}"
