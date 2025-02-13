---
title: Devtool
---

When you load your app in development, you'll notice a little "Instant" Icon show up:

{% screenshot src="/img/docs/devtool-pointer.jpg" /%}

This is your handy `devtool` shortcut. Once you click it, you'll see a widget that lets you make changes to your app.

Use the handy `Explorer` to make changes to your data and schema:

{% screenshot src="/img/docs/devtool-explorer.png" /%}

Or the `Sandbox` to try out different queries and transactions:

{% screenshot src="/img/docs/devtool-sandbox.png" /%}

## Changing Positions

You can choose where your devtool is position. Pass in the `devtool` configuration in `init`:

```typescript
import { init } from '@instantdb/react';

import schema from '../instant.schema.ts';

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  schema,
  devtool: {
    position: 'bottom-right',
  },
});
```

You can set `bottom-left`, `top-left`, `top-right`, `bottom-right`.

## Disabling the Devtool

If you would like to hide the devtool, you can add `devtool: false` to in `init`:

```typescript
import { init } from '@instantdb/react';

import schema from '../instant.schema.ts';

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  schema,
  devtool: false,
});
```

## Shortcuts

To quickly toggle the window, you can use the shortcut `ctrl` + `shit` + `0` (zero)

## Feedback?

If you have any feedback for the devtool, let us know on [Discord](https://discord.com/invite/VU53p7uQcE)
