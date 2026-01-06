---
title: Admin HTTP API
description: Direct HTTP access to Instant's admin API for non-JavaScript environments.
---

If your backend is written in Javascript, you can use the [`@instantdb/admin`](/docs/backend) SDK to connect your server to Instant.

But what if your backend isn't written in Javascript? That's where the HTTP API comes in.

You can use the HTTP API in your favorite backend language to run scripts, create custom auth flows, or evaluate sensitive app logic.

{% callout type="note" %}

If you give this documentation to your AI agent, it can create a custom SDK for your backend language. Here's the [markdown](/docs/http-api.md).

{% /callout %}

## Auth

First and foremost, grab your app's `APP_ID` and `ADMIN_TOKEN`. You can get this by going to your
[dashboard](https://instantdb.com/dash). To authenticate requests, include them in your HTTP headers:

```shell
curl -X POST "https://api.instantdb.com/admin/query" \
  -H "Content-Type: application/json" \
  # <-- Admin token here
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  # <-- App ID here
  -H "app-id: $APP_ID" \
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
['update', 'todos', todoId, { title: 'moop' }][
  // tx.goals[goalId].link({ todos: todoId })
  ('link', 'goals', goalId, { todos: todoId })
][
  // tx.goals[goalId].unlink({ todos: todoId })
  ('unlink', 'goals', goalId, { todos: todoId })
][
  // tx.goals[goalId].delete()
  ('delete', 'goals', goalId)
];
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
  # 👇
  -H "as-email: alyssa_p_hacker@instantdb.com" \
  -d '{"query":{"goals":{}}}'

# Or with their auth token
curl -X POST "https://api.instantdb.com/admin/query" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  # 👇
  -H "as-token: $REFRESH_TOKEN" \
  -d '{"query":{"goals":{}}}'

# Or use the db as a guest
curl -X POST "https://api.instantdb.com/admin/query" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  # 👇
  -H "as-guest: true" \
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

You can use `POST /admin/refresh_tokens` to generate auth tokens for your users.

Pass in an `email` or an `id` to create a refresh token:

```shell
# By email
curl -X POST "https://api.instantdb.com/admin/refresh_tokens" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d '{"email":"alyssa_p_hacker@instantdb.com"}'

# Or by ID

curl -X POST "https://api.instantdb.com/admin/refresh_tokens" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d "{\"id\":\"$USER_ID\"}"
```

If a user with the provider id or email does not exist, Instant will create the
user for you. The response includes `user.refresh_token`. You can pass this token onto your client, and use that to [log in](/docs/backend#2-frontend-db-auth-sign-in-with-token)

## Custom magic codes

We support a [magic code flow](/docs/auth) out of the box. However, if you'd like to use your own email provider to send the code, you can create a magic code with `POST /admin/magic_code`:

```shell
curl -X POST "https://api.instantdb.com/admin/magic_code" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d '{"email":"alyssa_p_hacker@instantdb.com"}'
```

You can also use Instant's default email provider to send a magic code:

```shell
curl -X POST "https://api.instantdb.com/admin/send_magic_code" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d '{"email":"alyssa_p_hacker@instantdb.com"}'
```

Similarly, you can verify a magic code too:

```shell
curl -X POST "https://api.instantdb.com/admin/verify_magic_code" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d '{"email":"alyssa_p_hacker@instantdb.com","code":"123456"}'
```

## Authenticated Endpoints

To authenticate users, have your frontend pass in a refresh token. Then use `POST /runtime/auth/verify_refresh_token` to verify it:

```shell
curl -X POST "https://api.instantdb.com/runtime/auth/verify_refresh_token" \
  -H "Content-Type: application/json" \
  -d "{\"app-id\": \"$APP_ID\", \"refresh-token\": \"$REFRESH_TOKEN\"}"
```

## Storage

You can also manage your app's [storage](/docs/storage) with the HTTP API.

### Upload Files

Upload a file with `PUT /admin/storage/upload`:

```shell
curl -X PUT "https://api.instantdb.com/admin/storage/upload" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -H "path: photos/demo.txt" \
  -H "Content-Type: text/plain" \
  --data-binary "@demo.txt"
```

### Delete Files

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

### List Files

List files by querying `$files`:

```shell
curl -X POST "https://api.instantdb.com/admin/query" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "app-id: $APP_ID" \
  -d '{"query":{"$files":{}}}'
```
