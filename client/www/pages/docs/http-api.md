---
title: Admin HTTP API
description: Direct HTTP access to Instant's admin API for non-JavaScript environments.
---

Welcome to Instant’s unofficial HTTP API!

# Setup: Auth

First and foremost, grab your app’s **APP_ID** and **ADMIN_TOKEN.** You can get this by going to your [dashboard](https://instantdb.com/dash)

You can include **APP_ID** and **ADMIN_TOKEN** in HTTP headers to authenticate

    curl -X POST "https://api.instantdb.com/admin/query" \
         -H "Content-Type: application/json" \
         -H "Authorization: Bearer $ADMIN_TOKEN" \
         -H "App-Id: $APP_ID" \
         # ...
# 1. Making Queries

To make queries, you can send a `POST /admin/query`: 


    curl -X POST "https://api.instantdb.com/admin/query" \
         -H "Content-Type: application/json" \
         -H "Authorization: Bearer $ADMIN_TOKEN" \
         -H "App-Id: $APP_ID" \
         -d '{"query": {"goals": {}}}'

We expect a body with a stringified InstaQL `query`: 


    JSON.stringify({query: YOUR_INSTAQL_QUERY})

As a refresher, you can learn about InstaQL queries [here](https://www.instantdb.com/docs/instaql).

**By default, admin queries bypass permission checks.** If you want to make a query on behalf of a user, see **Impersonating Users**

# 2. Making Transactions

To make transactions, you can send a `POST /admin/transact`:


    curl -X POST "https://api.instantdb.com/admin/transact" \
         -H "Content-Type: application/json" \
         -H "Authorization: Bearer $ADMIN_TOKEN" \
         -H "App-Id: $APP_ID" \
         -d '{
               "steps": [
                 [
                   "update",
                   "goals",
                   "8aa64e4c-64f9-472e-8a61-3fa28870e6cb",
                   {"title": "Get Fit"}
                 ]
               ]
             }'

`steps` is an internal representation of a change on Instant. This isn’t exposed externally yet, but no worries, they’re not too hairy. Here’s how they map to the [instant transactions](https://www.instantdb.com/docs/instaml) you know:


        // tx.goals[goalId1].update({title: "moop"})
        [
            "update",
            "goals",
            goalId1,
            {
                "title": "moop"
            }
        ]
        // tx.goals[goalId1].link({todos: todoId1})
        [
            "link",
            "goals",
            goalId1,
            {
                "todos": todoId1
            }
        ]
        // tx.goals[goalId1].unlink({todos: todoId1})
        [
            "unlink",
            "goals",
            goalId1
            {
                "todos": todoId1
            }
        ],
        // tx.goals[goalId1].delete()
        [
            "delete",
            "goals",
            goalId1
        ],
    ]

**By default, admin transactions bypass permission checks.** If you want to make a transaction on behalf of a user, see **Impersonating Users**

# 3. Impersonating Users

Sometimes you want to make queries or transactions *on behalf* of a user. If the user isn’t permitted, you want to fail. You can do this with the admin SDK. 

**as-email**
You can include the `as-email` header: 


    curl -X POST "https://api.instantdb.com/admin/query" \
         -H "Content-Type: application/json" \
         -H "Authorization: Bearer $ADMIN_TOKEN" \
         -H "App-Id: $APP_ID" \
         -H "as-email: stepan.p@gmail.com" \
         -d '{"query": {"goals": {}}}'

And you will make this transaction as the user `stepan.p@gmailcom`

**as-token**

Or, if you have a user’s `refresh_token`, you can use that too: 


    curl -X POST "https://api.instantdb.com/admin/query" \
         -H "Content-Type: application/json" \
         -H "Authorization: Bearer $ADMIN_TOKEN" \
         -H "App-Id: $APP_ID" \
         -H "as-token: $STOPA_REFRESH_TOKEN" \
         -d '{"query": {"goals": {}}}'

**as-guest**
Alternatively, you can make a query or a transaction, as though you weren’t logged in: 


    curl -X POST "https://api.instantdb.com/admin/query" \
         -H "Content-Type: application/json" \
         -H "Authorization: Bearer $ADMIN_TOKEN" \
         -H "App-Id: $APP_ID" \
         -H "as-guest: true" \
         -d '{"query": {"goals": {}}}'


# 4. Custom auth

Sometimes you want to implement custom auth flows. 

## createToken

If you want to create a user, or generate a refresh token for them, you can call `POST /admin/refresh_tokens` 


    curl -X POST "https://api.instantdb.com/admin/refresh_tokens" \
         -H "Content-Type: application/json" \
         -H "Authorization: Bearer $ADMIN_TOKEN" \
         -H "App-Id: $APP_ID" \
         -d '{"email": "stepan.p@gmail.com"}'

If the user doesn’t exist we’ll create one for you. You’ll get back a `refresh_token`, which you can pass down to the frontend to log them in.

## verifyToken 

Similarly, if you want to verify a token, use `POST /runtime/auth/verify_refresh_token`


    curl -X POST "https://api.instantdb.com/runtime/auth/verify_refresh_token" \
         -H "Content-Type: application/json" \
         -d "{\"app-id\": \"$APP_ID\", \"refresh-token\": \"$REFRESH_TOKEN\"}"

This will parse the $REFRESH_TOKEN return the `user` object 

To learn more about how to use `createToken` and `verifyToken`, [check out the docs](https://www.instantdb.com/docs/backend#custom-endpoints)

# The Javascript implementation

`@instantdb/admin` is a light wrapper around this API in javascript. Here’s the [source code](https://github.com/instantdb/instant/blob/main/client/packages/admin/src/index.ts). Feel free to use this as inspiration for a client library in other languages. We’re around to help unblock if anything!
