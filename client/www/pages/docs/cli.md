---
title: Instant CLI
---

The Instant CLI was designed to drive your Instant application entirely from a project's codebase. You can create apps as well as define an app's schema and permission rules all from the terminal.

The CLI is currently optimized for starting new projects that are managed
entirely from code. See the [migration guide below](#migrating-from-the-dashboard) if you have an existing app.

```sh
npx instant-cli login
```

You can view all commands and flags with `npx instant-cli -h`.

## Configuration as code

Instant CLI relies on the presence of two core config files: `instant.schema.ts`, where you define your application's data model, and `instant.perms.ts`, where you define access control rules for all of your graph's constructs.

You can learn more about [schemas here](/docs/schema) here and [permissions here](/docs/permissions).

## App ID

The CLI looks for `INSTANT_APP_ID` in `process.env`. As a convenience, it will also check for `NEXT_PUBLIC_INSTANT_APP_ID`, `PUBLIC_INSTANT_APP_ID`, and `VITE_INSTANT_APP_ID`.

## Specifying an auth token

In CI or similer environments, you may want to handle authentication without having to go through a web-based validation step each time. In these cases, you can provide a `INSTANT_CLI_AUTH_TOKEN` environment variable.

To obtain a token for later use, run `instant-cli login -p`. Instead of saving the token to your local device, the CLI will print it to your console. You can copy this token and provide it as `INSTANT_CLI_AUTH_TOKEN` later in your CI tool.

**Remember, auth tokens are secret, don't share them!**

## Actions

### Logging in

The first step to using the CLI is to log in with your Instant account.

```sh
npx instant-cli login
```

Note, this command will open Instant's dashboard in a browser window and prompt you to log in.

### Initializing a project


```sh
npx instant-cli init
```

Running `instant-cli init` will help you generate your `instant.schema.ts` and `instant.perms.ts` files. You can either create a new Instant app, or an import an existing one through this flow.

### Push schema

```sh
npx instant-cli push schema
```

`push schema` evaluates your `instant.schema.ts` file and applies it your app's production database. [Read more about schema as code](/docs/schema).

Note, to avoid accidental data loss, `push schema` does not delete entities or fields you've removed from your schema. You can manually delete them in the [Explorer](https://www.instantdb.com/dash?s=main&t=explorer).

Here's an example `instant.schema.ts` file.

```ts
import { i } from '@instantdb/react';

const _schema = i.schema({
  entities: {
    authors: i.entity({
      userId: i.string(),
      name: i.string(),
    }),
    posts: i.entity({
      name: i.string(),
      content: i.string(),
    }),
  },
  links: {
    authorPosts: {
      forward: {
        on: 'authors',
        has: 'many',
        label: 'posts',
      },
      reverse: {
        on: 'posts',
        has: 'one',
        label: 'author',
      },
    },
  },
  rooms: {
    chat: {
      presence: i.entity({
        nickname: i.string()
      })
    }
  },
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export { type AppSchema };
export default schema;
```

### Push perms

```sh
npx instant-cli push perms
```

`push perms` evaluates your `instant.perms.ts` file and applies it your app's production database. `instant.perms.ts` should export an object implementing Instant's standard permissions CEL+JSON format. [Read more about permissions in Instant](/docs/permissions).

Here's an example `instant.perms.ts` file.

```ts
const rules = {
  allow: {
    posts: {
      bind: ['isAuthor', "auth.id in data.ref('authors.userId')"],
      allow: {
        view: 'true',
        create: 'isAuthor',
        update: 'isAuthor',
        delete: 'isAuthor',
      },
    },
  },
};

export default rules;
```

### Pull: migrating from the dashboard

If you already created an app in the dashboard and created some schema and
permissions, you can run `npx instant-cli pull --app <APP_ID>` to generate an `instant.schema.ts` and `instant.perms.ts` files based on your production configuration.

```bash
npx instant-cli pull schema
npx instant-cli pull perms
npx instant-cli pull # pulls both schema and perms
```

{% callout type="warning" %}

Note: Strongly typed attributes are under active development. For now, `pull schema` will default all attribute types to `i.any()`.

{% /callout %}
