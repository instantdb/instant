#!/usr/bin/env bash
set -euo pipefail

# ------------------------------------------------------------
# clone_app.sh
#
#  Required flags
#   --env        prod | dev
#   --app-id     <UUID of the app to clone>
#
#  Optional Flags
#   --new-email  <creator e-mail for the clone>
#   --new-title  "Title for the cloned app"
#
# NOTES
#   • When --env prod   → connection string comes from prod_connection_string.sh
#   • When --env dev    → connects to the local database
#                         named “instant”.
# ------------------------------------------------------------

usage() {
  cat <<USAGE >&2
USAGE:
  $0 --env {prod|dev} --app-id APP_UUID [--new-email EMAIL] [--new-title TITLE]
USAGE
  exit 1
}

script_dir=$(dirname "${BASH_SOURCE[0]}")
prod_url="$("$script_dir/prod_connection_string.sh")"
dev_default_url="instant"

env="" ; app_id="" ; new_email="" ; new_title=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)        env="$2";       shift 2 ;;
    --app-id)     app_id="$2";    shift 2 ;;
    --new-email)  new_email="$2"; shift 2 ;;
    --new-title)  new_title="$2"; shift 2 ;;
    *) usage ;;
  esac
done

[[ -z "$env" || -z "$app_id" ]] && usage

case "$env" in
  prod) dest_db_url="$prod_url" ;;
  dev)  dest_db_url="$dev_default_url" ;;
  *)    echo "--env must be 'prod' or 'dev'." >&2; exit 1 ;;
esac

psql "$dest_db_url" \
     -v old_app_id="$app_id" \
     -v creator_email="$new_email" \
     -v new_title="$new_title" \
     -f "$script_dir/clone_app.sql"
