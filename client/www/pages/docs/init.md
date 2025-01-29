---
title: Initializing Instant
---

The first step to using Instant in your app is to call `init` before rendering your component tree.

```javascript
import { init } from '@instantdb/react';

// Instant app
const APP_ID = '__APP_ID__';

const db = init({ appId: APP_ID });

function App() {
  return <Main />;
}
```

With that, you can use `db` to [write data](/docs/instaml), [make queries](/docs/instaql), [handle auth](/docs/auth), and more!

## Typesafety

If you're using typescript, `init` accepts a `schema` argument. Adding a schema provides auto-completion and typesafety for your queries and transactions.

```typescript
import { init, i } from '@instantdb/react';

// Instant app
const APP_ID = '__APP_ID__';

const schema = i.schema({
  entities: {
    todos: i.entity({
      text: i.string(),
      done: i.boolean(),
      createdAt: i.number(),
    }),
  },
});

const db = init({ appId: APP_ID, schema });
```

To learn more about writing schemas, head on over to the [Modeling your data](/docs/modeling-data) section.
