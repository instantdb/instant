#!/usr/bin/env bash
set -euo pipefail

API_URI="${API_URI:-https://api.instantdb.com}"
MAGIC_EMAIL_DEFAULT="stopa@instantdb.com"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is required to run this script." >&2
    exit 1
  fi
}

require_cmd node
require_cmd curl

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

log() {
  printf "\n==> %s\n" "$1"
}

wait_for_file_contains() {
  local file="$1"
  local needle="$2"
  local timeout_ms="$3"
  node -e '
    const fs = require("fs");
    const needle = process.argv[1];
    const file = process.argv[2];
    const timeoutMs = Number(process.argv[3]);
    const start = Date.now();
    function check() {
      let data = "";
      try {
        data = fs.readFileSync(file, "utf8");
      } catch (err) {
        data = "";
      }
      if (data.includes(needle)) {
        process.exit(0);
      }
      if (Date.now() - start > timeoutMs) {
        process.exit(1);
      }
      setTimeout(check, 200);
    }
    check();
  ' "$needle" "$file" "$timeout_ms"
}

print_json() {
  node -e '
    const fs = require("fs");
    const input = fs.readFileSync(0, "utf8").trim();
    if (!input) process.exit(0);
    try {
      const data = JSON.parse(input);
      process.stdout.write(JSON.stringify(data, null, 2));
      process.stdout.write("\n");
    } catch (err) {
      process.stdout.write(input + "\n");
    }
  '
}

json_field() {
  local path="$1"
  node -e '
    const fs = require("fs");
    const input = fs.readFileSync(0, "utf8");
    const data = JSON.parse(input || "{}");
    const keys = process.argv[1].split(".");
    let cur = data;
    for (const key of keys) {
      if (cur == null) break;
      cur = cur[key];
    }
    if (cur === undefined || cur === null) process.exit(1);
    process.stdout.write(String(cur));
  ' "$path"
}

json_assert() {
  local expr="$1"
  node -e '
    const fs = require("fs");
    const expr = process.argv[1];
    const input = fs.readFileSync(0, "utf8").trim();
    const data = input ? JSON.parse(input) : {};
    const fn = new Function("data", `return (${expr});`);
    if (!fn(data)) process.exit(1);
  ' "$expr"
}

assert_json() {
  local name="$1"
  local expr="$2"
  local body="$3"
  if ! printf "%s" "$body" | json_assert "$expr"; then
    echo "Response assertion failed: $name" >&2
    echo "$body" >&2
    exit 1
  fi
}

assert_contains() {
  local name="$1"
  local needle="$2"
  local file="$3"
  if ! grep -qF "$needle" "$file"; then
    echo "Expected $name output to contain: $needle" >&2
    cat "$file" >&2
    exit 1
  fi
}

request_ok() {
  local name="$1"
  shift
  local out
  out="$(mktemp)"
  local status
  status=$(curl -sS -o "$out" -w "%{http_code}" "$@")
  if [[ "$status" != "200" ]]; then
    echo "Request failed: $name (HTTP $status)" >&2
    cat "$out" >&2
    exit 1
  fi
}

request_json() {
  local name="$1"
  shift
  local out
  out="$(mktemp)"
  local status
  status=$(curl -sS -o "$out" -w "%{http_code}" "$@")
  if [[ "$status" != "200" ]]; then
    echo "Request failed: $name (HTTP $status)" >&2
    cat "$out" >&2
    exit 1
  fi
  cat "$out"
}

log_request() {
  local name="$1"
  local detail="$2"
  log "$name"
  if [[ -n "$detail" ]]; then
    echo "$detail"
  fi
}

log_response() {
  local name="$1"
  local body="$2"
  echo "Response ($name):"
  printf "%s" "$body" | print_json
}

log_request "Provisioning ephemeral app" "POST /dash/apps/ephemeral"
TITLE="http-api-curl-test-$(date +%s)"
create_res=$(request_json "create ephemeral app" \
  -X POST "$API_URI/dash/apps/ephemeral" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"$TITLE\"}")
log_response "create ephemeral app" "$create_res"
APP_ID=$(printf "%s" "$create_res" | json_field "app.id")
ADMIN_TOKEN=$(printf "%s" "$create_res" | json_field "app.admin-token")

if [[ -z "$APP_ID" || -z "$ADMIN_TOKEN" ]]; then
  echo "Failed to provision ephemeral app." >&2
  exit 1
fi

echo "APP_ID=$APP_ID"

AUTH_HEADERS=(
  -H "Authorization: Bearer $ADMIN_TOKEN"
  -H "app-id: $APP_ID"
)
JSON_HEADER=(-H "Content-Type: application/json")

TODO_ID=$(node -e "console.log(crypto.randomUUID())")
EMAIL="http-api-curl-test-$TITLE@example.com"

log_request "Transact" "POST /admin/transact (update todos/$TODO_ID title='Curl test')"
transact_body=$(printf '{"steps":[["update","todos","%s",{"title":"Curl test"}]]}' "$TODO_ID")
echo "Request body: $transact_body"
transact_res=$(request_json "transact" \
  -X POST "$API_URI/admin/transact" \
  "${JSON_HEADER[@]}" \
  "${AUTH_HEADERS[@]}" \
  -d "$transact_body")
log_response "transact" "$transact_res"
assert_json "transact" "typeof data['tx-id'] === 'number'" "$transact_res"

log_request "Query" "POST /admin/query (where todos.id = $TODO_ID)"
query_body=$(printf '{"query":{"todos":{"$":{"where":{"id":"%s"}}}}}' "$TODO_ID")
echo "Request body: $query_body"
query_res=$(request_json "query" \
  -X POST "$API_URI/admin/query" \
  "${JSON_HEADER[@]}" \
  "${AUTH_HEADERS[@]}" \
  -d "$query_body")
log_response "query" "$query_res"
assert_json "query" "Array.isArray(data.todos) && data.todos.some(t => t.id === \"$TODO_ID\" && t.title === 'Curl test')" "$query_res"

SSE_TODO_ID=$(node -e "console.log(crypto.randomUUID())")
log_request "Subscribe query" "POST /admin/subscribe-query (SSE, where todos.id = $SSE_TODO_ID)"
SSE_TITLE="SSE test"
SSE_OUTPUT="$TMP_DIR/subscribe.txt"
SSE_QUERY=$(printf '{"query":{"todos":{"$":{"where":{"id":"%s"}}}}}' "$SSE_TODO_ID")
echo "Request body: $SSE_QUERY"
(
  curl -s -N -i --max-time 12 -o "$SSE_OUTPUT" \
    -X POST "$API_URI/admin/subscribe-query" \
    "${JSON_HEADER[@]}" \
    "${AUTH_HEADERS[@]}" \
    -d "$SSE_QUERY"
) &
SSE_PID=$!

if ! wait_for_file_contains "$SSE_OUTPUT" "\"op\":\"add-query-ok\"" 6000; then
  echo "Subscribe query did not return add-query-ok within timeout." >&2
  cat "$SSE_OUTPUT" >&2
  exit 1
fi

sse_transact_body=$(printf '{"steps":[["update","todos","%s",{"title":"%s"}]]}' "$SSE_TODO_ID" "$SSE_TITLE")
echo "SSE transact body: $sse_transact_body"
request_ok "sse transact" \
  -X POST "$API_URI/admin/transact" \
  "${JSON_HEADER[@]}" \
  "${AUTH_HEADERS[@]}" \
  -d "$sse_transact_body"

if ! wait_for_file_contains "$SSE_OUTPUT" "\"title\":\"$SSE_TITLE\"" 8000; then
  echo "Subscribe query did not stream the update within timeout." >&2
  cat "$SSE_OUTPUT" >&2
  exit 1
fi

SSE_UPDATE_LINE=$(grep -m 1 "\"title\":\"$SSE_TITLE\"" "$SSE_OUTPUT" || true)
if [[ -n "$SSE_UPDATE_LINE" ]]; then
  echo "SSE update observed (truncated):"
  echo "$SSE_UPDATE_LINE" | cut -c1-300
fi

set +e
wait "$SSE_PID"
set -e

if ! grep -qE "HTTP/.* 200" "$SSE_OUTPUT"; then
  echo "Subscribe query did not return HTTP 200." >&2
  cat "$SSE_OUTPUT" >&2
  exit 1
fi
echo "SSE output (first 20 lines):"
head -n 20 "$SSE_OUTPUT"
assert_contains "subscribe-query" "\"title\":\"$SSE_TITLE\"" "$SSE_OUTPUT"

log_request "Create refresh token" "POST /admin/refresh_tokens (email $EMAIL)"
create_token_body=$(printf '{"email":"%s"}' "$EMAIL")
echo "Request body: $create_token_body"
create_token_res=$(request_json "create token" \
  -X POST "$API_URI/admin/refresh_tokens" \
  "${JSON_HEADER[@]}" \
  "${AUTH_HEADERS[@]}" \
  -d "$create_token_body")
log_response "create token" "$create_token_res"
REFRESH_TOKEN=$(printf "%s" "$create_token_res" | json_field "user.refresh_token")
assert_json "create token" "typeof data.user?.refresh_token === 'string'" "$create_token_res"

log_request "Verify refresh token" "POST /runtime/auth/verify_refresh_token"
verify_body=$(printf '{"app-id":"%s","refresh-token":"%s"}' "$APP_ID" "$REFRESH_TOKEN")
echo "Request body: $verify_body"
verify_res=$(request_json "verify token" \
  -X POST "$API_URI/runtime/auth/verify_refresh_token" \
  "${JSON_HEADER[@]}" \
  -d "$verify_body")
log_response "verify token" "$verify_res"
USER_ID=$(printf "%s" "$verify_res" | json_field "user.id")
assert_json "verify token" "data.user?.id === '$USER_ID'" "$verify_res"

log_request "Query as email" "POST /admin/query (as-email $EMAIL)"
query_email_res=$(request_json "query as-email" \
  -X POST "$API_URI/admin/query" \
  "${JSON_HEADER[@]}" \
  "${AUTH_HEADERS[@]}" \
  -H "as-email: $EMAIL" \
  -d "$query_body")
log_response "query as-email" "$query_email_res"
assert_json "query as-email" "Array.isArray(data.todos) && data.todos.some(t => t.id === \"$TODO_ID\")" "$query_email_res"

log_request "Query as token" "POST /admin/query (as-token)"
query_token_res=$(request_json "query as-token" \
  -X POST "$API_URI/admin/query" \
  "${JSON_HEADER[@]}" \
  "${AUTH_HEADERS[@]}" \
  -H "as-token: $REFRESH_TOKEN" \
  -d "$query_body")
log_response "query as-token" "$query_token_res"
assert_json "query as-token" "Array.isArray(data.todos) && data.todos.some(t => t.id === \"$TODO_ID\")" "$query_token_res"

log_request "Query as guest" "POST /admin/query (as-guest true)"
query_guest_res=$(request_json "query as-guest" \
  -X POST "$API_URI/admin/query" \
  "${JSON_HEADER[@]}" \
  "${AUTH_HEADERS[@]}" \
  -H "as-guest: true" \
  -d "$query_body")
log_response "query as-guest" "$query_guest_res"
assert_json "query as-guest" "Array.isArray(data.todos) && data.todos.some(t => t.id === \"$TODO_ID\")" "$query_guest_res"

log_request "Get user" "GET /admin/users?id=$USER_ID"
get_user_res=$(request_json "get user" \
  -X GET "$API_URI/admin/users?id=$USER_ID" \
  "${AUTH_HEADERS[@]}")
log_response "get user" "$get_user_res"
assert_json "get user" "data.user?.id === '$USER_ID'" "$get_user_res"

log_request "Presence" "GET /admin/rooms/presence?room-type=chat&room-id=room-123"
presence_res=$(request_json "get presence" \
  -X GET "$API_URI/admin/rooms/presence?room-type=chat&room-id=room-123" \
  "${AUTH_HEADERS[@]}")
log_response "get presence" "$presence_res"
assert_json "get presence" "typeof data.sessions === 'object'" "$presence_res"

log_request "Sign out" "POST /admin/sign_out (refresh_token)"
sign_out_body=$(printf '{"refresh_token":"%s"}' "$REFRESH_TOKEN")
echo "Request body: $sign_out_body"
sign_out_res=$(request_json "sign out" \
  -X POST "$API_URI/admin/sign_out" \
  "${JSON_HEADER[@]}" \
  "${AUTH_HEADERS[@]}" \
  -d "$sign_out_body")
log_response "sign out" "$sign_out_res"
assert_json "sign out" "typeof data === 'object'" "$sign_out_res"

log_request "Magic code" "POST /admin/magic_code, /admin/send_magic_code, /admin/verify_magic_code"
MAGIC_EMAIL="${MAGIC_EMAIL:-$MAGIC_EMAIL_DEFAULT}"
magic_body=$(printf '{"email":"%s"}' "$MAGIC_EMAIL")
echo "Request body: $magic_body"
magic_res=$(request_json "generate magic code" \
  -X POST "$API_URI/admin/magic_code" \
  "${JSON_HEADER[@]}" \
  "${AUTH_HEADERS[@]}" \
  -d "$magic_body")
log_response "generate magic code" "$magic_res"
MAGIC_CODE=$(printf "%s" "$magic_res" | json_field "code")
assert_json "generate magic code" "typeof data.code === 'string' && data.code.length > 0" "$magic_res"

send_magic_res=$(request_json "send magic code" \
  -X POST "$API_URI/admin/send_magic_code" \
  "${JSON_HEADER[@]}" \
  "${AUTH_HEADERS[@]}" \
  -d "$magic_body")
log_response "send magic code" "$send_magic_res"
assert_json "send magic code" "typeof data.code === 'string' && data.code.length > 0" "$send_magic_res"

verify_magic_body=$(printf '{"email":"%s","code":"%s"}' "$MAGIC_EMAIL" "$MAGIC_CODE")
echo "Request body: $verify_magic_body"
verify_magic_res=$(request_json "verify magic code" \
  -X POST "$API_URI/admin/verify_magic_code" \
  "${JSON_HEADER[@]}" \
  "${AUTH_HEADERS[@]}" \
  -d "$verify_magic_body")
log_response "verify magic code" "$verify_magic_res"
assert_json "verify magic code" "data.user?.email === '$MAGIC_EMAIL'" "$verify_magic_res"

log_request "Storage" "Upload/list/delete files via admin storage endpoints"
FILE_A="$TMP_DIR/demo-a.txt"
FILE_B="$TMP_DIR/demo-b.txt"
echo "demo-a" > "$FILE_A"
echo "demo-b" > "$FILE_B"
REMOTE_A="curl-tests/$TITLE-a.txt"
REMOTE_B="curl-tests/$TITLE-b.txt"

upload_a_res=$(request_json "upload file a" \
  -X PUT "$API_URI/admin/storage/upload" \
  "${AUTH_HEADERS[@]}" \
  -H "path: $REMOTE_A" \
  -H "Content-Type: text/plain" \
  --data-binary "@$FILE_A")
log_response "upload file a" "$upload_a_res"
assert_json "upload file a" "typeof data.data?.id === 'string'" "$upload_a_res"

upload_b_res=$(request_json "upload file b" \
  -X PUT "$API_URI/admin/storage/upload" \
  "${AUTH_HEADERS[@]}" \
  -H "path: $REMOTE_B" \
  -H "Content-Type: text/plain" \
  --data-binary "@$FILE_B")
log_response "upload file b" "$upload_b_res"
assert_json "upload file b" "typeof data.data?.id === 'string'" "$upload_b_res"

files_query_body=$(printf '{"query":{"$files":{"$":{"where":{"path":"%s"}}}}}' "$REMOTE_A")
echo "Request body: $files_query_body"
files_query_res=$(request_json "query files" \
  -X POST "$API_URI/admin/query" \
  "${JSON_HEADER[@]}" \
  "${AUTH_HEADERS[@]}" \
  -d "$files_query_body")
log_response "query files" "$files_query_res"
files_query_expr=$(printf 'Array.isArray(data["$files"]) && data["$files"].some(f => f.path === "%s")' "$REMOTE_A")
assert_json "query files" "$files_query_expr" "$files_query_res"

signed_upload_res=$(request_json "signed upload url" \
  -X POST "$API_URI/admin/storage/signed-upload-url" \
  "${JSON_HEADER[@]}" \
  "${AUTH_HEADERS[@]}" \
  -d "{\"app_id\":\"$APP_ID\",\"filename\":\"curl-tests/$TITLE-c.txt\"}")
log_response "signed upload url" "$signed_upload_res"
assert_json "signed upload url" "typeof data.data === 'string' && data.data.startsWith('http')" "$signed_upload_res"

signed_download_res=$(request_json "signed download url" \
  -X GET "$API_URI/admin/storage/signed-download-url?app_id=$APP_ID&filename=$REMOTE_A" \
  "${AUTH_HEADERS[@]}")
log_response "signed download url" "$signed_download_res"
assert_json "signed download url" "typeof data.data === 'string' && data.data.startsWith('http')" "$signed_download_res"

delete_res=$(request_json "delete file" \
  -X DELETE "$API_URI/admin/storage/files?filename=$REMOTE_A" \
  "${AUTH_HEADERS[@]}")
log_response "delete file" "$delete_res"
assert_json "delete file" "typeof data.data?.id === 'string'" "$delete_res"

delete_many_res=$(request_json "delete many" \
  -X POST "$API_URI/admin/storage/files/delete" \
  "${JSON_HEADER[@]}" \
  "${AUTH_HEADERS[@]}" \
  -d "{\"filenames\":[\"$REMOTE_B\"]}")
log_response "delete many" "$delete_many_res"
assert_json "delete many" "Array.isArray(data.data?.ids)" "$delete_many_res"

log_request "Permissions debugging" "POST /admin/query_perms_check and /admin/transact_perms_check"
query_perms_body='{"query":{"todos":{}},"rules-override":{"todos":{"allow":{"view":"true"}}}}'
echo "Request body: $query_perms_body"
query_perms_res=$(request_json "query perms check" \
  -X POST "$API_URI/admin/query_perms_check" \
  "${JSON_HEADER[@]}" \
  "${AUTH_HEADERS[@]}" \
  -H "as-guest: true" \
  -d "$query_perms_body")
log_response "query perms check" "$query_perms_res"
assert_json "query perms check" "Array.isArray(data['check-results']) && typeof data.result === 'object'" "$query_perms_res"

transact_perms_body=$(printf '{"steps":[["update","todos","%s",{"title":"Perms check"}]],"rules-override":{"todos":{"allow":{"create":"true","update":"true","delete":"true","view":"true"}}}}' "$TODO_ID")
echo "Request body: $transact_perms_body"
transact_perms_res=$(request_json "transact perms check" \
  -X POST "$API_URI/admin/transact_perms_check" \
  "${JSON_HEADER[@]}" \
  "${AUTH_HEADERS[@]}" \
  -H "as-guest: true" \
  -d "$transact_perms_body")
log_response "transact perms check" "$transact_perms_res"
assert_json "transact perms check" "typeof data['tx-id'] === 'number' && data['all-checks-ok?'] === true" "$transact_perms_res"

log_request "Delete user" "DELETE /admin/users?id=$USER_ID"
delete_user_res=$(request_json "delete user" \
  -X DELETE "$API_URI/admin/users?id=$USER_ID" \
  "${AUTH_HEADERS[@]}")
log_response "delete user" "$delete_user_res"
assert_json "delete user" "data.deleted?.id === '$USER_ID'" "$delete_user_res"

echo "\nAll HTTP API curl checks passed."
