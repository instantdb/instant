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

With that, you can call `db` to [write data](/docs/instaml), [make queries](/docs/instaql), [handle auth](/docs/auth), and more! 

## Typesafety

By default, 


```typescript
import { init } from '@instantdb/react';

// Instant app
const APP_ID = '__APP_ID__';

type MyAppSchema = {
  metrics: {
    name: string;
    description: string;
  };
  logs: {
    date: string;
    value: number;
    unit: string;
  };
};

const db = init<MyAppSchema>({ appId: APP_ID });
```

You'll now be able to use `InstaQL` and `InstalML` throughout your app!

{% callout type="note" %}

**Psst: Schema-as-code and type safety!**

Instant now supports a [CLI-based workflow](/docs/cli), managing your [schema as code](/docs/schema), and [strictly-typed queries and mutations](/docs/strong-init). Give them a whirl and let us know what you think!

{% /callout %}
