---
title: Admin HTTP API
description: Direct HTTP access to Instant's admin API for non-JavaScript environments.
---

If your backend is written in Javascript, you can use the [`@instantdb/admin`](/docs/backend) SDK to connect your server to Instant.

But what if your backend isn't written in Javascript? That's where the HTTP API comes in.

This documents the majority of the endpoints available in the admin SDK. Use them in your favorite backend language to run scripts, create custom auth flows, or evaluate sensitive app logic.

{% callout type="note" %}

If you give this documentation to your AI agent, it can create a custom SDK for your backend language. Here's the [markdown](/docs/http-api.md).

{% /callout %}

## Auth

First and foremost, grab your app's `APP_ID` and `ADMIN_TOKEN`. You can get this by going to your
[dashboard](https://instantdb.com/dash). To authenticate requests, include them in your HTTP headers:

```shell
curl -X POST "https://api.instantdb.com/admin/query" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \ # <-- Admin token here
  -H "app-id: $APP_ID" \ # <-- App ID here
  -d '{"query":{"goals":{}}}'
```

## Reading and Writing Data

`POST /admin/query` and `POST /admin/transact` let your read and write data as an admin.

### query

To make queries, run `POST /admin/query` with an InstaQL query:

```shell
curl -X POST "https://api.instantdb.com/admin/query" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d '{"query":{"goals":{},"todos":{}}}'
```

If you need [rule params](/docs/permissions#rule-params), include `$$ruleParams` at the top-level:

```json
{
  "$$ruleParams": { "knownGoalId": "..." },
  "query": { "goals": {} }
}
```

As a refresher, you can learn about InstaQL queries
[here](/docs/instaql).

### transact

To make transactions, send `POST /admin/transact` with `steps`:

```shell
curl -X POST "https://api.instantdb.com/admin/transact" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d '{"steps":[["update","todos","<a-todo-uuid>",{"title":"Get fit"}]]}'
```

`steps` is the internal representation of Instant transactions. Here's how they
map to the [Instant transactions](/docs/instaml) you know:

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

## Impersonating users

When you use the admin API, you can make _any_ query or transaction. As an admin, you bypass permissions.

But sometimes you want to make requests on behalf of a
user and respect permissions. You can do this by passing the `as-email`, `as-token`, or `as-guest` headers.

```shell
# Scoped by their email
curl -X POST "https://api.instantdb.com/admin/query" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -H "as-email: alyssa_p_hacker@instantdb.com" \ # 👈
  -d '{"query":{"goals":{}}}'

# Or with their auth token
curl -X POST "https://api.instantdb.com/admin/query" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -H "as-token: $REFRESH_TOKEN" \ # 👈
  -d '{"query":{"goals":{}}}'

# Or use the db as a guest
curl -X POST "https://api.instantdb.com/admin/query" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -H "as-guest: true" \ # 👈
  -d '{"query":{"goals":{}}}'
```

{% callout type="note" %}
`as-email` requires an `ADMIN_TOKEN`. For `as-token` and `as-guest`, you could skip the
`Authorization` if you want too.
{% /callout %}

## Retrieve a user

Use `GET /admin/users` to fetch an app user by `email`, `id`, or `refresh_token`.

```shell
# By email!
curl -X GET "https://api.instantdb.com/admin/users?email=alyssa_p_hacker@instantdb.com" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID"

# By id
curl -X GET "https://api.instantdb.com/admin/users?id=$USER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID"

# Or by a refresh token
curl -X GET "https://api.instantdb.com/admin/users?refresh_token=$REFRESH_TOKEN" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID"
```

## Delete a user

Use `DELETE /admin/users` to delete an app user by `email`, `id`, or `refresh_token`.

```shell
# By email
curl -X DELETE "https://api.instantdb.com/admin/users?email=alyssa_p_hacker@instantdb.com" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID"

# By id
curl -X DELETE "https://api.instantdb.com/admin/users?id=$USER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID"

# Or by an auth token
curl -X DELETE "https://api.instantdb.com/admin/users?refresh_token=$REFRESH_TOKEN" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID"
```

## Presence in the Backend

If you use [rooms & presence](/docs/presence-and-topics), you may want to query for the data currently in a room. This can be especially useful if you are sending a notification for example, and want to skip it if the user is already online. To do get room data use `GET /admin/rooms/presence`. Make sure to pass in a `room-type` and a `room-id`:

```shell
curl -X GET "https://api.instantdb.com/admin/rooms/presence?room-type=chat&room-id=room-123" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID"
```

## Sign Out

`POST /admin/sign_out` allows you to log out users. You can log out a user out from every session by passing in their `email` or `id`. Or you can log a user out from a particular session by passing in a `refresh_token`:

```shell
# All sessions for this email sign out
curl -X POST "https://api.instantdb.com/admin/sign_out" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d '{"email":"alyssa_p_hacker@instantdb.com"}' # 👈

# All sessions for this user id sign out
curl -X POST "https://api.instantdb.com/admin/sign_out" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d "{\"id\":\"$USER_ID\"}" # 👈

# Just sign out the session for this refresh token
curl -X POST "https://api.instantdb.com/admin/sign_out" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d "{\"refresh_token\":\"$REFRESH_TOKEN\"}" # 👈
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
