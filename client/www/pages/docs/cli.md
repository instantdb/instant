---
title: Instant CLI
---

The Instant CLI was designed to drive your Instant application entirely from a project's codebase. You can create apps as well as define an app's schema and permission rules all from the terminal.

The CLI is currently optimized for starting new projects that are managed
entirely from code. See the [migration guide below](#migrating-from-the-dashboard) if you have an existing app.

```sh
npm install -D instant-cli
```

You can view all commands and flags with `npx instant-cli -h`.

## Configuration as code

Instant CLI relies on the presence of two core config files: `instant.schema.ts`, where you define your application's graph structure, and `instant.perms.ts`, where you define access control rules for all of your graph's constructs.

You can learn more about [schemas here](/docs/schema) here and [permissions here](/docs/permissions).

## Actions

### Logging in

The first step to using the CLI is to log in with your Instant account.

```sh
npx instant-cli login
```

Note, this command will open Instant's dashboard in a browser window and prompt you to log in.

### Initializing a project

Similar to `git init`, running `instant-cli init` will generate a new app id and add `instant.schema.ts` and `instant.perms.ts` files if none are present in your current directory.

```sh
npx instant-cli init
```

`instant-cli init` will spin up a new app under your account. It will also add `instant.schema.ts` and `instant.perms.ts` files if none are present in your project.

### Push schema

```sh
npx instant-cli push-schema
```

`push-schema` evals your `instant.schema.ts` file and applies it your app's production database. [Read more about schema as code](/docs/schema).

Note, to avoid accidental data loss, `push-schema` does not delete entities or fields you've removed from your schema. You can manually delete them in the [Explorer](https://www.instantdb.com/dash?s=main&t=explorer).

### Push perms

```sh
npx instant-cli push-schema
```

`push-schema` evals your `instant.perms.ts` file and applies it your app's production database. [Read more about permissions](/docs/permissions).

## Migrating from the dashboard

If you already created an app in the dashboard and created some schema and
permissions you can migrate to using the CLI by manually creating `instant.schema.ts` and `instant.perms.ts` files.
Follow these steps to ensure a smooth transition.

1. Create a new app from the root of your project with `instant-cli init`. This will create a new app in the dashboard and generate default `instant.schema.ts` and `instant.perms.ts` files.
2. Replace permissions from the dashboard to your `instant.perms.ts`.
3. Transcribe your schema from the dashboard to [instant's schema format](/docs/schema). Run `npx instant-cli push-schema` to apply the schema to your new app. Iterate on this until the schema of your new app matches your existing app.
4. With your schema and permissions in place, you can update the `APP_ID` in `instant.schema.ts` to your existing app.

You can now manage your app via `push-schema` and `push-perms` commands. In the future we will add a more automated migration process.
We also recommend you stick to the CLI for managing your app going forward to
keep your configuration in sync with your database (we'll also make this easier
in the future).
