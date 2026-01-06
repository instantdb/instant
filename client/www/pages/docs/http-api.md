---
title: Admin HTTP API
description: Direct HTTP access to Instant's admin API for non-JavaScript environments.
---

You can use Instant on the server without JavaScript. This is the underlying API
used by `@instantdb/admin`, and it's useful for non-JS languages or custom
integrations.

Base URL: `https://api.instantdb.com`

## Admin HTTP API

### Auth

Grab your app's `APP_ID` and `ADMIN_TOKEN` from the
[dashboard](https://instantdb.com/dash).

Include them as headers on admin endpoints:

```shell
curl -X POST "https://api.instantdb.com/admin/query" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d '{"query":{"goals":{}}}'
```

{% callout type="warning" %}
`ADMIN_TOKEN` is a full-access credential. Do not ship it to client devices or
expose it in source control.
{% /callout %}

## Reading and Writing Data

`query` and `transact` let you read and write data as an admin.

### query

To make queries, send `POST /admin/query` with an InstaQL query:

```shell
curl -X POST "https://api.instantdb.com/admin/query" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d '{"query":{"goals":{},"todos":{}}}'
```

Request shape:

```json
{
  "query": { "goals": {}, "todos": {} },
  "inference?": false
}
```

If you need rule params (for permissions with `$params`), include
`$$ruleParams` at the top-level:

```json
{
  "$$ruleParams": { "teamId": "team_123" },
  "query": { "goals": {} }
}
```

As a refresher, you can learn about InstaQL queries
[here](https://www.instantdb.com/docs/instaql).

{% callout type="note" %}
By default, admin queries bypass permission checks. If you want to make a query
on behalf of a user, see [Impersonating users](#impersonating-users).
{% /callout %}

### transact

To make transactions, send `POST /admin/transact` with `steps`:

```shell
curl -X POST "https://api.instantdb.com/admin/transact" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d '{"steps":[["update","todos","__TODO_ID__",{"title":"Get fit"}]]}'
```

Request shape:

```json
{
  "steps": [
    ["update", "todos", "__TODO_ID__", { "title": "Get fit" }]
  ],
  "throw-on-missing-attrs?": false
}
```

`steps` is the internal representation of Instant transactions. Here's how they
map to Instaml:

```javascript
// tx.todos[todoId].update({ title: "moop" })
["update", "todos", todoId, { "title": "moop" }]

// tx.goals[goalId].link({ todos: todoId })
["link", "goals", goalId, { "todos": todoId }]

// tx.goals[goalId].unlink({ todos: todoId })
["unlink", "goals", goalId, { "todos": todoId }]

// tx.goals[goalId].delete()
["delete", "goals", goalId]
```

{% callout type="note" %}
By default, admin transactions bypass permission checks. If you want to make a
transaction on behalf of a user, see [Impersonating users](#impersonating-users).
{% /callout %}

## Subscriptions on the backend

You can subscribe to queries over SSE with `POST /admin/subscribe-query`.
The connection stays open and streams updates.

```shell
curl -N -X POST "https://api.instantdb.com/admin/subscribe-query" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d '{"query":{"tasks":{}}}'
```

{% callout type="note" %}
Subscriptions keep a live connection open on your backend. Be sure to close them
when they are no longer needed.
{% /callout %}

## Schema

The HTTP API does not accept schema definitions directly. If your app already
has a schema, you can match the Admin SDK behavior by passing these flags:

- `inference?` on `POST /admin/query`
- `throw-on-missing-attrs?` on `POST /admin/transact`

These flags are set automatically by `@instantdb/admin` when you pass a schema
to `init`.

## Impersonating users

When you use the admin API, you can make any query or transaction. As an admin,
you bypass permissions. But sometimes you want to make requests on behalf of a
user and respect permissions.

You can do this with the `as-email`, `as-token`, or `as-guest` headers.

### as-email

```shell
curl -X POST "https://api.instantdb.com/admin/query" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -H "as-email: alyssa_p_hacker@instantdb.com" \
  -d '{"query":{"goals":{}}}'
```

### as-token

```shell
curl -X POST "https://api.instantdb.com/admin/query" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -H "as-token: $REFRESH_TOKEN" \
  -d '{"query":{"goals":{}}}'
```

### as-guest

```shell
curl -X POST "https://api.instantdb.com/admin/query" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -H "as-guest: true" \
  -d '{"query":{"goals":{}}}'
```

{% callout type="note" %}
`as-email` requires an `ADMIN_TOKEN`. For `as-token` and `as-guest`, you may omit
`Authorization` if you do not want to use an admin credential.
{% /callout %}

## Retrieve a user

Retrieve an app user record by `email`, `id`, or `refresh_token` using
`GET /admin/users`.

```shell
curl -X GET "https://api.instantdb.com/admin/users?email=alyssa_p_hacker@instantdb.com" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID"
```

```shell
curl -X GET "https://api.instantdb.com/admin/users?id=$USER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID"
```

```shell
curl -X GET "https://api.instantdb.com/admin/users?refresh_token=$REFRESH_TOKEN" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID"
```

## Delete a user

Delete an app user record by `email`, `id`, or `refresh_token` using
`DELETE /admin/users`.

```shell
curl -X DELETE "https://api.instantdb.com/admin/users?email=alyssa_p_hacker@instantdb.com" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID"
```

```shell
curl -X DELETE "https://api.instantdb.com/admin/users?id=$USER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID"
```

```shell
curl -X DELETE "https://api.instantdb.com/admin/users?refresh_token=$REFRESH_TOKEN" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID"
```

Note, this only deletes the user record. If there's additional data you need to
clean up you'll need to do it manually.

## Presence in the Backend

To fetch presence data for a room, use `GET /admin/rooms/presence`:

```shell
curl -X GET "https://api.instantdb.com/admin/rooms/presence?room-type=chat&room-id=room-123" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID"
```

## Sign Out

Log a user out from every session by passing `email` or `id`, or log them out
from a specific session by passing `refresh_token`:

```shell
curl -X POST "https://api.instantdb.com/admin/sign_out" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d '{"email":"alyssa_p_hacker@instantdb.com"}'
```

```shell
curl -X POST "https://api.instantdb.com/admin/sign_out" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d "{\"id\":\"$USER_ID\"}"
```

```shell
curl -X POST "https://api.instantdb.com/admin/sign_out" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d "{\"refresh_token\":\"$REFRESH_TOKEN\"}"
```

## Custom Auth

Create a refresh token with `POST /admin/refresh_tokens`:

```shell
curl -X POST "https://api.instantdb.com/admin/refresh_tokens" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d '{"email":"alyssa_p_hacker@instantdb.com"}'
```

For the UUID variant:

```shell
curl -X POST "https://api.instantdb.com/admin/refresh_tokens" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d "{\"id\":\"$USER_ID\"}"
```

If a user with the provider id or email does not exist, Instant will create the
user for you. The response includes `user.refresh_token`.

## Custom magic codes

Generate a magic code (use your own email provider):

```shell
curl -X POST "https://api.instantdb.com/admin/magic_code" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d '{"email":"alyssa_p_hacker@instantdb.com"}'
```

Send a magic code with Instant's email provider:

```shell
curl -X POST "https://api.instantdb.com/admin/send_magic_code" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d '{"email":"alyssa_p_hacker@instantdb.com"}'
```

Verify a magic code:

```shell
curl -X POST "https://api.instantdb.com/admin/verify_magic_code" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d '{"email":"alyssa_p_hacker@instantdb.com","code":"123456"}'
```

## Authenticated Endpoints

Verify a refresh token with `POST /runtime/auth/verify_refresh_token`:

```shell
curl -X POST "https://api.instantdb.com/runtime/auth/verify_refresh_token" \
  -H "Content-Type: application/json" \
  -d "{\"app-id\": \"$APP_ID\", \"refresh-token\": \"$REFRESH_TOKEN\"}"
```

## Syncing Auth

If you want to sync auth cookies for server-side frameworks, use the SDK helper
in `@instantdb/react` instead. See
[Syncing Auth in the backend docs](/docs/backend#syncing-auth).

## NextJS SSR

Instant has built-in support for SSR using NextJS. See
[the backend docs](/docs/backend#nextjs-ssr).

## Storage

Upload a file with `PUT /admin/storage/upload`:

```shell
curl -X PUT "https://api.instantdb.com/admin/storage/upload" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -H "path: photos/demo.txt" \
  -H "Content-Type: text/plain" \
  --data-binary "@demo.txt"
```

Delete a file by path:

```shell
curl -X DELETE "https://api.instantdb.com/admin/storage/files?filename=photos/demo.txt" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID"
```

Delete multiple files by path:

```shell
curl -X POST "https://api.instantdb.com/admin/storage/files/delete" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d '{"filenames":["photos/1.txt","photos/2.txt"]}'
```

List files by querying `$files`:

```shell
curl -X POST "https://api.instantdb.com/admin/query" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d '{"query":{"$files":{}}}'
```

Legacy signed URL endpoints (deprecated by the SDK):

```shell
curl -X POST "https://api.instantdb.com/admin/storage/signed-upload-url" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d "{\"app_id\":\"$APP_ID\",\"filename\":\"photos/demo.txt\"}"
```

```shell
curl -X GET "https://api.instantdb.com/admin/storage/signed-download-url?app_id=$APP_ID&filename=photos/demo.txt" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID"
```

## Permissions Debugging

Debug permissions checks for a query with `POST /admin/query_perms_check`:

```shell
curl -X POST "https://api.instantdb.com/admin/query_perms_check" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -H "as-guest: true" \
  -d '{"query":{"todos":{}},"rules-override":{"todos":{"allow":{"view":"true"}}}}'
```

Debug permissions checks for a transaction with `POST /admin/transact_perms_check`:

```shell
curl -X POST "https://api.instantdb.com/admin/transact_perms_check" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -H "as-guest: true" \
  -d '{"steps":[["update","todos","__TODO_ID__",{"title":"Perms check"}]],"rules-override":{"todos":{"allow":{"create":"true","update":"true","delete":"true","view":"true"}}}}'
```

## Reference implementation

`@instantdb/admin` is a light wrapper around this HTTP API. You can use the
[admin SDK source](https://github.com/instantdb/instant/blob/main/client/packages/admin/src/index.ts)
as a reference for building integrations in other languages.

## Testing the curl examples

A runnable script that exercises the curl examples (using an ephemeral app) is
available at `scripts/test-http-api-curls.sh`. It defaults `MAGIC_EMAIL` to
`stopa@instantdb.com`, or you can override it with an environment variable.
