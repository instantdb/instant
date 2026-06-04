#!/usr/bin/env sh
set -e

cd "$(dirname "$0")"

SSH_HOST=root@ip
DASHBOARD_URL="https://instant-dash.drewh.cloud"
SERVER_URL="https://instant-backend.drewh.cloud"
S3_PUBLIC_ENDPOINT="https://instant-files.drewh.cloud"

stack_config() {
  env -i \
    PATH="$PATH" \
    DASHBOARD_URL="$DASHBOARD_URL" \
    SERVER_URL="$SERVER_URL" \
    S3_PUBLIC_ENDPOINT="$S3_PUBLIC_ENDPOINT" \
    docker stack config --compose-file swarm.yml
}

stack_config | (ssh $SSH_HOST 'docker stack deploy -c - instant')
