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
import asyncio
from instantdb import AsyncInstant, id

async def main():
    async with AsyncInstant(
        app_id="YOUR_APP_ID",
        admin_token="YOUR_ADMIN_TOKEN",
    ) as db:
        # Transact (InstaML)
        goal_id = id()
        await db.transact(db.tx.goals[goal_id].update({"title": "Get fit"}))

        # Query (InstaQL)
        result = await db.query({"goals": {"todos": {}}})

        # Auth — magic codes, tokens, user management
        token = await db.auth.create_token(email="alyssa@example.com")

        # Impersonate for permission-scoped queries
        async with db.as_user(guest=True) as scoped:
            scoped_result = await scoped.query({"goals": {}})

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

Defaults to `http://localhost:8888`; set `INSTANT_API_URI` in `.env` to
point elsewhere.

# Questions?

If you have any questions, feel free to drop us a line on our [Discord](https://discord.com/invite/VU53p7uQcE)
