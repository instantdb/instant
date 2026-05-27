<p align="center">
  <a href="https://instantdb.com">
    <img alt="Shows the Instant logo" src="https://instantdb.com/img/icon/android-chrome-512x512.png" width="10%">
  </a>
  <h1 align="center">Python Admin SDK</h1>
</p>

<p align="center">
  <a
    href="https://discord.com/invite/VU53p7uQcE" >
    <img height=20 src="https://img.shields.io/discord/1031957483243188235" />
  </a>
  <img src="https://img.shields.io/github/stars/instantdb/instant" alt="stars">
</p>

<p align="center">
   <a href="https://www.instantdb.com/docs/start-python">Get Started</a> ·
   <a href="https://instantdb.com/examples">Examples</a> ·
   <a href="https://www.instantdb.com/docs/backend">Docs</a> ·
   <a href="https://discord.com/invite/VU53p7uQcE">Discord</a>
<p>

Welcome to [Instant's](http://instantdb.com) Python Admin SDK.

## Quickstart

```bash
uv add instantdb
# or
pip install instantdb
```

Requires Python 3.10+.

`app_id` and `admin_token` can be passed explicitly or read from
`INSTANT_APP_ID` / `INSTANT_ADMIN_TOKEN` environment variables.

```python
from instantdb import Instant, id

db = Instant(
    app_id="YOUR_APP_ID",
    admin_token="YOUR_ADMIN_TOKEN",
)

# Transact (InstaML)
goal_id = id()
db.transact(db.tx.goals[goal_id].update({"title": "Get fit"}))

# Query (InstaQL)
result = db.query({"goals": {"todos": {}}})

# Auth: magic codes, tokens, user management
token = db.auth.create_token(email="alyssa@example.com")

# Impersonate for permission-scoped queries
scoped = db.as_user(guest=True)
scoped_result = scoped.query({"goals": {}})
```

The async client (`AsyncInstant`) ships the same surface plus
`subscribe_query` (live SSE subscriptions) and `streams` (durable
bidirectional byte streams). Use it from FastAPI handlers, agents, or
anywhere you're already running an event loop:

```python
import asyncio
from instantdb import AsyncInstant

adb = AsyncInstant()

async def main():
    async with adb.subscribe_query({"goals": {}}) as sub:
        async for payload in sub:
            process(payload)

asyncio.run(main())
```

Head on over to the [Python Docs](https://www.instantdb.com/docs/start-python) for more usage docs!

## Development

```bash
cd client/packages/python
uv sync
make check   # ruff + mypy strict + pytest
make fmt
```

### Editing the SDK source

**Only edit `src/instantdb/_async/`.** The sync client at
`src/instantdb/_sync/` is generated from the async tree via
[`unasync`](https://github.com/python-trio/unasync) and is committed to
the repo. After any change to `_async/`, regenerate:

```bash
make unasync
```

This runs `scripts/run_unasync.py` (preprocesses + applies replacement
rules) then ruff (import sort + format). Commit the generated `_sync/`
tree alongside your async change.

Some modules under `_async/` are intentionally async-only — they're
listed in the `ASYNC_ONLY` set in `scripts/run_unasync.py` and each one
explains its rationale in its own docstring (typically: relies on
asyncio coordination primitives that don't survive unasync's
token-rewrite).

**Adding a new file under `_async/`**:

- HTTP-shaped surface (request/response, no background tasks): just
  drop it in and re-run `make unasync` — it'll be picked up
  automatically.
- Async-only surface (background tasks, asyncio coordination):
  drop it in, add its path to `ASYNC_ONLY` in
  `scripts/run_unasync.py`, and note the why in the module's docstring
  so the next person doesn't have to figure it out.

If you add a method or import that should exist only on the async
client (inside a file that _is_ unasynced), wrap it in marker comments
and re-run `make unasync`:

```python
# UNASYNC_REMOVE_START
def new_async_only_method(self): ...
# UNASYNC_REMOVE_END
```

Full mechanics — replacement rules, preprocessing details, what to
avoid — live in the docstring of `scripts/run_unasync.py`.

### Manual integration testing via the sandbox

Unit tests cover validation, header construction, and pure-logic helpers.
The sandbox at `client/sandbox/admin-sdk-python/` is the integration-test
layer — testers exercise the SDK against a real Instant server and assert
on outcomes. That's where wire-format bugs and divergence from JS surface.

```bash
cd ../../sandbox/admin-sdk-python
cp .env.example .env   # fill in INSTANT_APP_ID + INSTANT_ADMIN_TOKEN
uv sync
# uncomment a tester call inside main() in src/main.py
uv run --env-file .env python -m src.main
```

The sandbox has two entry points: `src/main.py` for the async client
(everything, including subscribe + streams) and `src/main_sync.py` for
the sync client (auth, query, transact, storage, rooms, webhooks).

Defaults to `http://localhost:8888`; set `INSTANT_API_URI` in `.env` to
point elsewhere.

# Questions?

If you have any questions, feel free to drop us a line on our [Discord](https://discord.com/invite/VU53p7uQcE)
