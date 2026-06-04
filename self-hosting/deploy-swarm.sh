SSH_HOST="redacted"

DASHBOARD_URL="http://dash.localhost"
SERVER_URL="http://server.localhost"
S3_PUBLIC_ENDPOINT="http://storage.localhost"

stack_config() {
  env -i \
    PATH="$PATH" \
    DASHBOARD_URL="$DASHBOARD_URL" \
    SERVER_URL="$SERVER_URL" \
    S3_PUBLIC_ENDPOINT="$S3_PUBLIC_ENDPOINT" \
    docker stack config --compose-file swarm.yml
}

stack_config | (ssh $SSH_HOST 'docker stack deploy -c - --prune')
