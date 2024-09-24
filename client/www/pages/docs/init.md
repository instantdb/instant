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

If you're using TypeScript, `init` accepts a `Schema` generic, which will provide auto-completion and type-safety for `useQuery` results.

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

**Schema-as-code and type safety**

Instant also support a [CLI-based workflow](/docs/cli) and [schema-as-code](/docs/schema), plus we're piloting [strictly-typed queries and mutations](/docs/strong-init).

{% /callout %}
