---
title: Recommended Workflow
description: How to develop with Instant
---

At a high level, here is the recommended workflow for developing with Instant:

1. Authenticate with Instant in your terminal via `npx instant-cli login`.
1. Create new projects via `npx create-instant-app`.
1. Push changes to your schema and permissions via `npx instant-cli push`.
1. Use the [Sandbox](https://www.instantdb.com/dash?t=sandbox) to debug queries,
   transactions, and permissions.
1. When you're ready for production, [restrict creating](/docs/patterns#restrict-creating-new-attributes) new attributes.
1. If you need more help, check out our [patterns page](/docs/patterns) for common
   recipes or drop us a line on our [Discord](https://discord.com/invite/VU53p7uQcE).

## Authenticating with Instant in your terminal

Use the [Instant CLI](/docs/instant-cli) to authenticate with Instant in your
terminal. After authenticating you'll be able to create new projects
and have them associated with your Instant account. This will also enable you to
push and pull changes to your projects. To authenticate, run:

```
npx instant-cli login
```

This will open a browser window where you can log in or sign up for an account.

## Starting a new project

After authenticating, you can create a new project with
[create-instant-app](/docs/create-instant-app). This will give you some starter code, and set up rules for your LLM
agent. If your agent supports it, we also recommend setting up the [Instant MCP Server](/docs/using-llms#instant-mcp-server).

The default rules cover the basics of using InstantDB. But if you want to add
more docs for specific functionality, you can append `.md` to the end of any doc
page URL to get the raw markdown. For example, here are the docs for
[adding auth](/docs/auth/magic-codes.md).

## Updating schema and permissions

As your project evolves, you'll likely need to update your schema and permissions. We
recommend using the Instant CLI to do this. You can make
edits to your local schema and permission files, and then run `npx instant-cli push` to push changes to your project.

If you prefer a GUI, you can also make changes via the explorer in the [Instant
dashboard](https://www.instantdb.com/dash?t=explorer). To pull these changes
into your local files, run `npx instant-cli pull`.

## Debugging queries, transactions, and permissions

If you're not sure why a query or transaction isn't working, or if you're
running into permission issues, you can use the
[Sandbox](https://www.instantdb.com/dash?t=sandbox) to help you debug.

The sandbox is a REPL-like environment that lets you run queries and
transactions against your project. It serves two goals:

1. Lets you run queries and transactions quickly.
2. Gives you debug info to inspect permission checks and performance.

Some examples of debug info you can see in the sandbox:

- Raw output from queries and transactions
- Permission check results for all entities returned by a query
- Permission check results for each tx operation in a transaction
- How long queries and transactions take to run

### Dealing with timeout errors

InstantDB has the following timeouts for queries and transactions:

- 5 seconds for queries and transactions with the client SDK.
- 30 seconds for queries and transactions in the admin SDK and sandbox.

We set these timeouts intentionally for performance and reliability. We do not
allow timeouts to be configured. Sometimes fixing a timeout is as simple as
adding an index. Other times you'll need to iterate to identify the bottleneck. Some
common causes of timeouts:

- Missing an index
- Fetching or transacting too much data
- Expensive `where` clauses
- Expensive permission rules that traverse a lot of data

Set up test code in your sandbox and run experiments to get under the timeout limit.
From there you can apply the same changes to your app code.

### Dealing with permission errors

The sandbox is one of the best tools for debugging permission errors. Whenever
you run a query or transaction in the sandbox, you can see all the permission
checks that were run, and whether they passed or failed.

If it's unclear why a permission is returning false, re-run the transaction with the permission broken
down into smaller pieces. For example, if you have a permission rule like

```
"view": "auth.id in data.ref('members.id')"
```

It can be helpful to re-run the sandbox with the permission rule changed to

```
"view": "data.ref('members.id')"
```

This will show you the output of just that part of the rule. You can use this technique to
iterate on complex permission rules until you find the part that is causing the
permission to return false.

## Going to production

Huzzah, you're ready for prime time! When you go to production, be sure to [restrict creating](/docs/patterns#restrict-creating-new-attributes) new
attributes. You can also
consider setting up [separate apps](/docs/patterns#managing-local-vs-production-apps) for local development and
production.

## Best practices and getting help

We highly recommend going through our docs to understand how Instant works. We
tried our best to keep them delightful and example-driven!

We've also made a [patterns page](/docs/patterns) with common recipes for using
InstantDB. If you still have questions, feel free to drop us a line on our
[Discord](https://discord.com/invite/VU53p7uQcE).
