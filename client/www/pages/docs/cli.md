---
title: Instant CLI
---

The Instant CLI was designed to drive your Instant application entirely from a project's codebase. You can create apps, define your data model, and update your permissions, **all through your terminal**.

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

Similarily, when you change `instant.perms.ts`, you can run: 

```shell {% showCopy=true %}
npx instant-cli push perms
```

## Pull

Sometimes, you change your schema or rules from your Explorer. If you want to `pull` the latest version of schema and perms for production, write: 

```shell {% showCopy=true %}
npx instant-cli@latest pull
```

This will generate new `instant.schema.ts` and `instant.perms.ts` files, based on your production state.

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

## Authenticating in CI

In CI or similer environments, you may want to handle authentication without having to go through a web-based validation step each time. 

In these cases, you can provide a `INSTANT_CLI_AUTH_TOKEN` environment variable.

To obtain a token for later use, run: 

```shell {% showCopy=true %}
npx instant-cli@latest login -p
```

Instead of saving the token to your local device, the CLI will print it to your console. You can copy this token and provide it as `INSTANT_CLI_AUTH_TOKEN` later in your CI tool.

