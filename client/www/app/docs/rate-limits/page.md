---
nextjs:
  metadata:
    title: 'Rate Limits'
    description: 'How to add rate limiting to your Instant app with permission rules.'
---

You can add rate limiting to your app with the `rateLimit` object in the [permission rules](/docs/permissions). Rate limits let you control how often users can perform actions like creating records or querying data.

## Defining rate limits

Rate limits are configured in the `$rateLimits` key of your permissions. Each rate limit has a name and a configuration with a `limits` array.

```tsx {% showCopy=true %}
// instant.perms.ts
import type { InstantRules } from '@instantdb/react';

const rules = {
  todos: {
    allow: {
      create: 'rateLimit.createTodos.limit(auth.id)',
    },
  },
  $rateLimits: {
    createTodos: {
      limits: [
        {
          capacity: 10,
          refill: {
            amount: 10,
            period: '1 hour',
          },
        },
      ],
    },
  },
} satisfies InstantRules;

export default rules;
```

In this example, each user can create at most 10 todos per hour. Once they hit the limit, further creates will be rejected until tokens refill.

## How it works

Rate limits use a [token bucket](https://en.wikipedia.org/wiki/Token_bucket) algorithm. Each bucket starts full at its `capacity`. Every time a rule calls `rateLimit.bucketName.limit(key)`, one token is consumed from the bucket for that key. When the bucket is empty, the request is rejected with a 429 error. Tokens refill over time based on your configuration.

The `key` argument (e.g. `auth.id`) determines _who_ the limit applies to. Different keys get independent buckets. For example, `rateLimit.createTodos.limit(auth.id)` gives each user their own rate limit. To rate-limit by IP address, use `rateLimit.createTodos.limit(request.ip)`.

### Rate limits are per entity

Rate limit rules are evaluated per entity, just like other permission rules. For `create`, `update`, and `delete`, the rule runs once for each entity in the transaction. For `view`, the rule runs once for each entity in the query result.

This means a query that returns 50 rows will consume 50 tokens. Keep this in mind when setting your `capacity` — it should account for the number of entities your queries typically return, not just the number of requests.

## Configuration

Each entry in the `limits` array accepts:

| Field           | Required | Default            | Description                                                                                                                    |
| --------------- | -------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `capacity`      | Yes      |                    | Maximum number of tokens in the bucket.                                                                                        |
| `refill.amount` | No       | Same as `capacity` | Number of tokens added per refill.                                                                                             |
| `refill.period` | No       | `"1 hour"`         | How often tokens refill. Accepts durations like `"30 minutes"`, `"1 day"`, `"2 hours"`. Must be between 1 second and 24 hours. |
| `refill.type`   | No       | `"greedy"`         | Either `"greedy"` (tokens refill continuously) or `"interval"` (tokens refill all at once at the end of each period).          |

### Greedy vs interval refill

With **greedy** refill (the default), tokens trickle in continuously. If your capacity is 60 with a period of `"1 hour"`, you get roughly one token per minute.

With **interval** refill, all tokens are added at once when the period elapses. If your capacity is 60 with a period of `"1 hour"`, you get all 60 tokens back at the end of one hour.

## Using rate limits in rules

### Basic usage

Call `rateLimit.bucketName.limit(key)` in any `allow` rule. It consumes a token and returns `true` if the request is allowed, or throws a rate limit error if the bucket is empty. You can optionally pass a second argument to consume multiple tokens: `rateLimit.bucketName.limit(key, 5)`.

```json {% showCopy=true %}
{
  "messages": {
    "allow": {
      "create": "rateLimit.sendMessage.limit(auth.id)"
    }
  },
  "$rateLimits": {
    "sendMessage": {
      "limits": [
        {
          "capacity": 5,
          "refill": { "period": "1 minute" }
        }
      ]
    }
  }
}
```

### Combining with other rules

Since `limit` returns `true` on success, you can combine it with other permission checks using `&&`:

```json {% showCopy=true %}
{
  "messages": {
    "allow": {
      "create": "auth.id != null && rateLimit.sendMessage.limit(auth.id)"
    }
  },
  "$rateLimits": {
    "sendMessage": {
      "limits": [
        {
          "capacity": 20,
          "refill": { "period": "1 hour" }
        }
      ]
    }
  }
}
```

{% callout type="note" %}

Put `rateLimit.limit(...)` last in your `&&` chain. CEL short-circuits, so if an earlier check fails, no token is consumed.

{% /callout %}

### Rate limiting queries

You can rate limit `view` rules the same way:

```json {% showCopy=true %}
{
  "messages": {
    "allow": {
      "view": "rateLimit.readMessages.limit(auth.id)"
    }
  },
  "$rateLimits": {
    "readMessages": {
      "limits": [
        {
          "capacity": 100,
          "refill": { "period": "1 hour" }
        }
      ]
    }
  }
}
```

### Consuming multiple tokens

You can consume more than one token per request by passing a second argument:

```json {% showCopy=true %}
{
  "uploads": {
    "allow": {
      "create": "rateLimit.uploadLimit.limit(auth.id, 5)"
    }
  },
  "$rateLimits": {
    "uploadLimit": {
      "limits": [
        {
          "capacity": 100,
          "refill": { "period": "1 day" }
        }
      ]
    }
  }
}
```

### Multiple limits

You can apply multiple limits to the same bucket. For example, a burst limit and a sustained limit:

```json {% showCopy=true %}
{
  "$rateLimits": {
    "sendMessage": {
      "limits": [
        {
          "capacity": 5,
          "refill": { "period": "1 minute", "type": "interval" }
        },
        {
          "capacity": 100,
          "refill": { "period": "1 day" }
        }
      ]
    }
  }
}
```

This allows a burst of 5 messages per minute, but no more than 100 per day.

### Rate limiting by different keys

The key you pass to `limit` determines the granularity. Here are some common patterns:

```json {% showCopy=true %}
{
  "posts": {
    "allow": {
      "create": "rateLimit.createPosts.limit(auth.id)"
    }
  }
}
```

Rate limit per user with `auth.id`. Each user gets their own bucket.

```json {% showCopy=true %}
{
  "posts": {
    "allow": {
      "create": "rateLimit.createPosts.limit(request.ip)"
    }
  }
}
```

Rate limit by IP address with `request.ip`. Useful for limiting unauthenticated requests.

## Error handling

When a rate limit is exceeded, Instant returns an error with `type: "rate-limited"` and a `hint` containing `retry-after` (seconds until the bucket refills):

```json
{
  "type": "rate-limited",
  "message": "Your request exceeded the rate limit.",
  "hint": {
    "retry-at": "2026-04-14T12:01:00Z",
    "retry-after": 12,
    "remaining-tokens": 0
  }
}
```

For transactions, the error is thrown as an `InstantAPIError`. You can catch it and show a message to the user:

```js {% showCopy=true %}
try {
  await db.transact(db.tx.messages[id()].update({ text: 'hello' }));
} catch (e) {
  if (e.body?.type === 'rate-limited') {
    const retryAfter = e.body.hint['retry-after'];
    alert(`Too fast! Try again in ${retryAfter} seconds.`);
  }
}
```

For queries, rate limit errors will appear in the `error` field returned by `useQuery`:

```js {% showCopy=true %}
const { data, error } = db.useQuery({ messages: {} });

if (error?.body?.type === 'rate-limited') {
  // handle rate limit
}
```
