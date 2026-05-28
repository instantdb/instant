---
nextjs:
  metadata:
    title: 'Getting started with Python'
    description: 'How to use Instant from Python with the admin SDK.'
---

Instant offers a Python admin SDK with an API that mirrors our javascript
admin SDK. If you read the JS docs, you can mentally substitute Python syntax
and write working code.

## Install

```shell {% showCopy=true %}
uv add instantdb
# or
pip install instantdb
```

Python 3.10+ is required.

To scaffold a new project:

```shell {% showCopy=true %}
npx create-instant-app --python my-app
cd my-app
uv sync
```

This creates a starter script with `instant.schema.ts`, `instant.perms.ts`,
a `.env`, and a `main.py`.

## Usage

Our Python SDK mirrors the JS admin SDK's surface and behavior, with a few
Pythonic adjustments. A basic example looks like this:

```python {% showCopy=true %}
from instantdb import Instant, id

db = Instant(
    # You can pass these explicitly, by default they fall back to
    # INSTANT_APP_ID and INSTANT_ADMIN_TOKEN environment variables
    app_id="__APP_ID__",
    admin_token="__ADMIN_TOKEN__",
)

# Write data
goal_id = id()
db.transact(db.tx.goals[goal_id].update({"title": "Get fit"}))

# Read data
result = db.query({"goals": {}})
for goal in result["goals"]:
    print(goal.title)
```

We also provide a typed client via codegen. Run `npx instant-cli genpy` to
generate `instant_types.py` with Pydantic models for your schema and a typed
`Instant` class that autocompletes your entities and validates mutation shapes.

```python {% showCopy=true %}
from instant_types import Instant, id

db = Instant()

# Write data
goal_id = id()
db.transact(db.tx.goals[goal_id].update({"title": "Get fit"}))

# Read data
result = db.query({"goals": {}})
for goal in result["goals"]:
    print(goal.title)
```

WHen you scaffold with `npx create-instant-app --python`, we generate
`instant_types.py` for you as part of the setup. The reamining examples on this
page use the typed client, but the untyped `Instant` from `instantdb` works the
same way at runtime.

{% callout type="warning" %}

Exposing your `app_id` is fine, but the `admin_token` bypasses permission
checks. Keep it server-side and regenerate it from the dashboard if it
leaks.

{% /callout %}

## Async usage

Use `AsyncInstant` and `await` each call:

```python {% showCopy=true %}
import asyncio
from instant_types import AsyncInstant, id

db = AsyncInstant()

async def main():
    goal_id = id()
    await db.transact(db.tx.goals[goal_id].update({"title": "Get fit"}))

    result = await db.query({"goals": {}})
    for goal in result["goals"]:
        print(goal.title)

asyncio.run(main())
```

`subscribe_query` and `streams` are only available on `AsyncInstant`.
Everything else works on both.

## Schema and typed results

`instant-cli genpy` regenerates `instant_types.py` from your
`instant.schema.ts`. Run it after schema changes.

```shell {% showCopy=true %}
npx instant-cli genpy
```

Query results come back as Pydantic models with typed link fields:

```python {% showCopy=true %}
from instant_types import Instant, Goal

db = Instant()

result = db.query({"goals": {}})
goals: list[Goal] = result["goals"]
for goal in goals:
    print(goal.title)
```

See [Modeling data](/docs/modeling-data) for the full schema reference.

## Reading data

`db.query` takes the same InstaQL dict shape used elsewhere in Instant:

```python {% showCopy=true %}
# Top-level fetch
result = db.query({"goals": {}, "todos": {}})

# Nested children
result = db.query({"goals": {"todos": {}}})

# Operators (camelCase keys, matching the wire format)
db.query({"goals": {"$": {"where": {"title": {"$ne": "Get fit"}}}}})

# Pagination + ordering
db.query({"goals": {"$": {"limit": 10, "order": {"createdAt": "desc"}}}})
```

### Rule params

Use the `rule_params` keyword argument to pass values into permission
rules. It maps to `$$ruleParams` on the wire.

```python {% showCopy=true %}
db.query({"goals": {}}, rule_params={"region": "us"})
```

## Writing data

Mutations use the InstaML proxy syntax. Each chunk is built with
`db.tx.<namespace>[id].<op>(...)`.

```python {% showCopy=true %}
from instant_types import Instant, id, lookup

db = Instant()

goal_id = id()
todo_id = id()

db.transact([
    db.tx.goals[goal_id].update({"title": "Get fit"}),
    db.tx.todos[todo_id].update({"title": "Run"}),
    db.tx.goals[goal_id].link({"todos": todo_id}),
    db.tx.users[lookup("email", "alyssa@instantdb.com")].update(
        {"name": "Alyssa"}
    ),
])
```

Supported ops: `update`, `create`, `link`, `unlink`, `delete`, `merge`,
`rule_params`. `transact` accepts a single chunk or a list, commits
atomically, and returns `{"tx-id": int}`.

`id()` returns a UUID string. `lookup(attr, value)` returns an opaque
sentinel usable as an entity id, handy for upserts keyed on a unique
attribute like email.

### Special namespaces

System namespaces like `$files` and `$users` aren't valid Python
attribute names. Use subscript access:

```python {% showCopy=true %}
db.transact(db.tx["$files"][file_id].delete())
```

`db.tx.goals` and `db.tx["goals"]` are interchangeable for regular names.

See [Writing data](/docs/instaml) for the full mutation reference.

## Subscribing to queries

`AsyncInstant.subscribe_query` opens an SSE stream and yields payloads as
the query result changes:

```python {% showCopy=true %}
import asyncio
from instant_types import AsyncInstant

db = AsyncInstant()

async def main():
    async with db.subscribe_query({"todos": {}}) as sub:
        async for payload in sub:
            if payload["type"] == "error":
                print("error:", payload["error"])
                break
            print("data:", payload["data"])

asyncio.run(main())
```

The connection opens in `__aenter__` and closes on context exit,
including on exception. Transient SSE drops after the first connection
reconnect silently with exponential backoff. HTTP errors on the initial
connect surface as an `error` payload and end iteration.

{% callout type="note" %}

Subscriptions keep a live connection open. Keep the `async with` block
alive as long as you need updates.

{% /callout %}

## Streams

Instant Streams are durable, append-only byte sequences over a
bidirectional SSE connection. They're excellent for LLM completions, chat
streaming, and resumable log writes.

### Writing

```python {% showCopy=true %}
import asyncio
from instant_types import AsyncInstant

db = AsyncInstant()

async def main():
    async with db.streams.write(client_id="agent-completion-123") as writer:
        stream_id = await writer.stream_id

        async for chunk in claude_response:
            await writer.write(chunk)

asyncio.run(main())
```

`write(chunk: str)` appends a string chunk. `await writer.stream_id`
resolves once the server confirms the start handshake. The stream closes
durably on context exit; an exception aborts it.

### Reading

```python {% showCopy=true %}
async with db.streams.read(stream_id="...") as reader:
    async for chunk in reader:
        print(chunk)
```

Identify the stream by `stream_id=` or `client_id=`. Pass `byte_offset=`
to resume from a specific position after a disconnect.

### Querying stream metadata

The `$streams` namespace is queryable like any other:

```python {% showCopy=true %}
result = db.query({
    "$streams": {
        "$": {"where": {"clientId": "agent-completion-123"}},
    },
})
```

See [Streams](/docs/streams) for the full reference.

## Auth

Mirrors the JS `db.auth` namespace. Method names are snake_case;
overload-style arguments are keyword-only.

### Magic codes

```python {% showCopy=true %}
db.auth.send_magic_code("alyssa@instantdb.com")

# Or generate the code yourself for a custom email provider
result = db.auth.generate_magic_code("alyssa@instantdb.com")
print(result["code"])

# Verify it
user, created = db.auth.check_magic_code(
    email="alyssa@instantdb.com",
    code="123456",
)
```

### Tokens

```python {% showCopy=true %}
# Mint a token for a user (creates them if they don't exist)
token = db.auth.create_token(email="alyssa@instantdb.com")
# or
token = db.auth.create_token(id="...")

# Verify a refresh token (e.g. one passed in from a client)
user = db.auth.verify_token(token)
```

### Users

```python {% showCopy=true %}
user = db.auth.get_user(email="alyssa@instantdb.com")
user = db.auth.get_user(id="...")
user = db.auth.get_user(refresh_token="...")

db.auth.delete_user(email="alyssa@instantdb.com")
db.auth.sign_out(email="alyssa@instantdb.com")
```

## Impersonation

The admin client bypasses permissions by default. To run queries and
transactions _with_ permission checks, scope the client to a user with
`as_user`:

```python {% showCopy=true %}
# As a specific user
scoped = db.as_user(email="alyssa@instantdb.com")
goals_as_alyssa = scoped.query({"goals": {}})

# As a guest
guest = db.as_user(guest=True)
guest.query({"publicData": {}})

# Or with a refresh token
scoped = db.as_user(token="user-refresh-token")
```

`as_user` returns a new immutable client. The original `db` is unchanged.

### Without an admin token

You can construct a client without an admin token if you only impersonate.
Direct queries on the base `db` will fail, but `db.as_user(token=...)` and
`db.as_user(guest=True)` will work.

```python {% showCopy=true %}
db = Instant(app_id="__APP_ID__")  # no admin_token

user_db = db.as_user(token="...")
user_db.query({"todos": {}})
```

This is useful for running the SDK on untrusted machines where shipping
the admin token would be a leak.

## Storage

`db.storage.upload_file` accepts `bytes`, `pathlib.Path`, or a binary
file-like object. File-backed inputs stream from disk rather than
buffering into memory.

```python {% showCopy=true %}
from pathlib import Path

# From bytes
db.storage.upload_file(
    "photos/hello.txt",
    b"hello world",
    content_type="text/plain",
)

# From a Path (opened and closed by the SDK)
db.storage.upload_file(
    "photos/demo.png",
    Path("./demo.png"),
    content_type="image/png",
)

# From an open file (uploads from the current position; not closed)
with open("demo.png", "rb") as f:
    db.storage.upload_file("photos/demo.png", f, content_type="image/png")
```

Content length is computed automatically. Non-seekable streams need an
explicit `file_size` (bytes remaining):

```python {% showCopy=true %}
db.storage.upload_file(
    "exports/data.jsonl",
    stream,
    content_type="application/jsonl",
    file_size=10_000_000,
)
```

To delete a file, use a transaction:

```python {% showCopy=true %}
db.transact(db.tx["$files"][file_id].delete())
```

See [Storage](/docs/storage) for the broader storage model.

## Rooms

Read presence data for a room:

```python {% showCopy=true %}
sessions = db.rooms.get_presence("chat", "room-123")
# {peer_id: {"data": ..., "peer-id": ..., "user": ...}}
```

`get_presence` is the only `rooms` method on the admin SDK. See
[Presence, Cursors, and Activity](/docs/presence-and-topics).

## Debug helpers

`debug_query` and `debug_transact` run an operation with a permission
check and return why the check passed or failed for every matching row.
They require an `as_user` context.

```python {% showCopy=true %}
result = db.as_user(guest=True).debug_query({"goals": {}})
# {"result": ..., "check_results": [{"id": ..., "check": True}, ...]}

db.as_user(guest=True).debug_transact(
    db.tx.goals[id()].update({"title": "x"}),
)
```

## Webhooks

The Python SDK ships the same two-layer webhook surface as the JS SDK,
bundled as `instantdb.webhooks`.

- `db.webhooks.manager.*` for CRUD on subscriptions
- `db.webhooks.validate_signature / fetch_payloads / process_payload` for
  receiving events

### Managing subscriptions

```python {% showCopy=true %}
webhook = db.webhooks.manager.create(
    url="https://api.example.com/instant",
    namespaces=["goals", "todos"],
    actions=["create", "update", "delete"],
)

# Inspect
db.webhooks.manager.list()
event = db.webhooks.manager.get_event(webhook["id"], isn=42)
payload = db.webhooks.manager.get_payload(webhook["id"], isn=42)
events = db.webhooks.manager.list_events(webhook["id"])
next_page = db.webhooks.manager.list_events(
    webhook["id"], after=events["cursor"]
)

# Modify
db.webhooks.manager.update(
    webhook["id"],
    url="https://api.example.com/instant-v2",
    namespaces=["goals"],
)
db.webhooks.manager.enable(webhook["id"])
db.webhooks.manager.disable(webhook["id"], reason="Pausing for migration")
db.webhooks.manager.delete(webhook["id"])
db.webhooks.manager.resend_event(webhook["id"], isn=42)
```

Returned dicts keep camelCase wire-format keys (`webhookId`,
`idempotencyKey`, etc.) so they match the JS shape.

### Receiving webhooks

Three primitives compose into framework integration:

```python
# 1. Verify the Ed25519 signature
db.webhooks.validate_signature(
    signature_header=request.headers["Instant-Signature"],
    body=raw_bytes,
    max_age_seconds=300,
)
# Raises InstantError on bad signature or stale timestamp

# 2. Exchange the JWT body for the full payload of records
payload = db.webhooks.fetch_payloads(body=raw_bytes)

# 3. Dispatch records to handlers (most-specific-wins)
db.webhooks.process_payload(handlers, payload)
```

Handlers are a dict of dicts keyed by namespace and action, with
`$default` catch-alls at either level:

```python {% showCopy=true %}
def on_goal_create(record):
    # record["after"] is the new entity; record["before"] is None on "create"
    save_to_search_index(record["after"])

handlers = {
    "goals": {
        "create": on_goal_create,
        "$default": lambda record: None,
    },
    "$default": {
        "$default": lambda record: None,
    },
}

db.webhooks.process_payload(handlers, payload)
```

### FastAPI example

```python {% showCopy=true %}
from fastapi import FastAPI, Request, HTTPException
from instant_types import AsyncInstant, InstantError

app = FastAPI()
db = AsyncInstant()

async def on_goal_create(record):
    print("new goal:", record["after"])

handlers = {"goals": {"create": on_goal_create}}

@app.post("/webhooks/instant")
async def webhook_in(request: Request):
    body = await request.body()
    sig = request.headers.get("Instant-Signature", "")
    try:
        db.webhooks.validate_signature(signature_header=sig, body=body)
    except InstantError:
        raise HTTPException(401)

    payload = await db.webhooks.fetch_payloads(body)
    await db.webhooks.process_payload(handlers, payload)
    return {"ok": True}
```

`validate_signature` is sync (pure crypto, no HTTP). `fetch_payloads`
and `process_payload` are awaitable under `AsyncInstant`. Handlers must
match: `async def` for `AsyncInstant`, plain `def` for `Instant`.

### Typed webhook handlers

`instant_types` ships a `WebhookHandlers` TypedDict and per-namespace
record types so handlers can take typed Pydantic instances:

```python {% showCopy=true %}
from instant_types import Instant, WebhookHandlers, GoalCreateRecord

db = Instant()

def on_goal_create(record: GoalCreateRecord) -> None:
    print(record.after.title)

handlers: WebhookHandlers = {"goals": {"create": on_goal_create}}
db.webhooks.process_payload(handlers, payload)
```

Records are validated into the matching Pydantic model before dispatch.
Wrong namespace, wrong action, or a mismatched handler signature fails
the type check.

See [Webhooks](/docs/webhooks) for the broader webhook model.

## Errors

All errors raised by the SDK are subclasses of `InstantError`. The API
returns a non-2xx response as `InstantAPIError`, which carries `status`
and `body`:

```python {% showCopy=true %}
from instant_types import Instant, InstantAPIError, id

db = Instant()

try:
    db.transact(db.tx.goals[id()].update({"title": "Get fit"}))
except InstantAPIError as e:
    if e.status == 429:
        print("Rate limited, backing off")
    else:
        raise
```
