#!/usr/bin/env bash
set -euo pipefail

# ------------------------------------------------------------
# clone_app.sh
#
#  Required flags
#   --env        prod | dev
#   --app-id     <UUID of the app to clone>
#   --temporary-email  <when the cloning is in progress, the app will show up under this owner>
#   --dest-email       <creator e-mail for the final clone>
#   --new-title        "Title for the cloned app"
#   --num-workers      <number of workers>
#   --batch-size       <batch size per worker>
#
# NOTES
#   • When --env prod   → connection string comes from prod_connection_string.sh
#   • When --env dev    → connects to the local database
#                         named “instant”.
# ------------------------------------------------------------

usage() {
  cat <<USAGE >&2
USAGE:
  $0 --env {prod|dev} --app-id APP_UUID --temporary-email EMAIL --dest-email EMAIL \\
     --new-title TITLE --num-workers N --batch-size N
USAGE
  exit 1
}

script_dir="$(dirname "${BASH_SOURCE[0]}")"
dev_default_url="jdbc:postgresql://localhost:5432/instant"

env="" ; app_id="" ; temporary_email="" ; dest_email="" ; new_title="" ; num_workers="" ; batch_size=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)              env="$2";             shift 2 ;;
    --app-id)           app_id="$2";          shift 2 ;;
    --temporary-email)  temporary_email="$2"; shift 2 ;;
    --dest-email)       dest_email="$2";      shift 2 ;;
    --new-title)        new_title="$2";       shift 2 ;;
    --num-workers)      num_workers="$2";     shift 2 ;;
    --batch-size)       batch_size="$2";      shift 2 ;;
    *) usage ;;
  esac
done

[[ -z "$env" || -z "$app_id" || -z "$temporary_email" || -z "$dest_email" || -z "$new_title" || -z "$num_workers" || -z "$batch_size" ]] && usage

case "$env" in
  prod) dest_db_url=$($script_dir/prod_connection_string.sh) ;;
  dev)  dest_db_url="$dev_default_url" ;;
  *)    echo "--env must be 'prod' or 'dev'." >&2; exit 1 ;;
esac

server_dir="$(dirname "$script_dir")"

clj_args=(
  -M -m instant.scripts.clone-app
  --database-url "$dest_db_url"
  --app-id "$app_id"
  --temporary-email "$temporary_email"
  --dest-email "$dest_email"
  --new-title "$new_title"
  --num-workers "$num_workers"
  --batch-size "$batch_size"
)

(cd "$server_dir" && clojure "${clj_args[@]}")
