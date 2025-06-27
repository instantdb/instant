---
title: Instant CLI
description: How to use the Instant CLI to manage schema and permissions.
---

The Instant CLI was designed to drive your Instant application entirely from a project's codebase. You can create apps, define your data model, and update your permissions, **all through your terminal**.

## Login

To get started, you need to log in to your Instant account. You can do this by running:

```shell {% showCopy=true %}
npx instant-cli@latest login
```

This will open a browser window where you can authenticate with your Instant account. Once authenticated you'll be able to run commands that interact with your Instant apps!

## Init

To get started, head on over to your project's root repository, and write:

```shell {% showCopy=true %}
npx instant-cli@latest init
```

This will guide you through picking an Instant app and generate two files for you:

- `instant.schema.ts` defines your application's data model.
- `instant.perms.ts` defines your permission rules.

To learn how to change `instant.schema.ts`, check our [Modeling Data](/docs/modeling-data). For `instant.perms.ts`, check out the [permissions](/docs/permissions) page.

## Push

When you're ready to publish your changes to `instant.schema.ts`, run:

```shell {% showCopy=true %}
npx instant-cli@latest push schema
```

This will evaluate your schema, compare it with production, and migrate your data model.

{% callout %}

`push schema` doesn't support _renaming_ or _deleting_ attributes yet. To do this, use the [Explorer](/docs/modeling-data#update-or-delete-attributes)

{% /callout %}

Similarly, when you change `instant.perms.ts`, you can run:

```shell {% showCopy=true %}
npx instant-cli@latest push perms
```

## Pull

Sometimes, you change your schema or rules from your Explorer. If you want to `pull` the latest version of schema and perms for production, write:

```shell {% showCopy=true %}
npx instant-cli@latest pull
```

This will generate new `instant.schema.ts` and `instant.perms.ts` files, based on your production state.

## Create App

Sometimes you may just want to create a new Instant app without overwriting your
existing schema and permission files. This is convenient when you want to create
a new app for testing schema changes or permissions. You can use the `create-app` command to generate a new app without affecting your current files:

```shell {% showCopy=true %}
npx instant-cli@latest create-app
```

You can then run `npx instant-cli@latest push --app <your-new-app-id>` to push
the schema and permissions for this new app.

## App ID

Whenever you run a CLI command, we look up your app id. You can either provide an app id as an option:

```shell
  npx instant-cli@latest init --app $MY_APP_ID
```

Or store it in your `.env` file:

```yaml
INSTANT_APP_ID=*****
```

As a convenience, apart from `INSTANT_APP_ID`, we also check for:

- `NEXT_PUBLIC_INSTANT_APP_ID` for next apps,
- `PUBLIC_INSTANT_APP_ID` for svelte apps,
- `VITE_INSTANT_APP_ID` for vite apps
- `NUXT_PUBLIC_INSTANT_APP_ID` for nuxt apps
- `EXPO_PUBLIC_INSTANT_APP_ID` for expo apps

## Where to save files

By default, Instant will search for your `instant.schema.ts` and `instant.perms.ts` file in:

1. The `root` directory: `./`
2. The `src` directory: `./src`
3. The `app` directory: `./app`

If you'd like to save them in a custom location, you can set the following environment variables:

- `INSTANT_SCHEMA_FILE_PATH` sets the location for your `instant.schema.ts` file.
- `INSTANT_PERMS_FILE_PATH` sets the location for your `instant.perms.ts` file.

```yaml
# in your .env file
INSTANT_SCHEMA_FILE_PATH=./src/db/instant.schema.ts
INSTANT_PERMS_FILE_PATH=./src/db/instant.perms.ts
```

## Authenticating in CI

In CI or similar environments, you may want to handle authentication without having to go through a web-based validation step each time.

In these cases, you can provide a `INSTANT_CLI_AUTH_TOKEN` environment variable.

To obtain a token for later use, run:

```shell {% showCopy=true %}
npx instant-cli@latest login -p
```

Instead of saving the token to your local device, the CLI will print it to your console. You can copy this token and provide it as `INSTANT_CLI_AUTH_TOKEN` later in your CI tool.
