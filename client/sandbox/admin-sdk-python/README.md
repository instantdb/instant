# admin-sdk-python sandbox

Manual integration tester for the `instantdb` Python SDK. Used to validate
behavior against a real Instant server.

## Setup

```bash
cp .env.example .env
# Fill in INSTANT_APP_ID and INSTANT_ADMIN_TOKEN
uv sync
```

## Run

Uncomment a tester call inside `main()` in `src/main.py`, then:

```bash
uv run --env-file .env python -m src.main
```

Edits to the SDK at `../../packages/python` show up on the next `uv run`
because of the editable install.

## Notes

- Not wired into `make dev` or CI. The point is to give us an
  integration-test layer that hits a real server, replacing low-value
  mock unit tests.
- Tester functions are defined at module scope in `src/main.py`; the
  `main()` function calls them but every call is commented out by
  default. Uncomment what you want to run.
- Defaults to a local Instant server (`http://localhost:8888`). Set
  `INSTANT_API_URI` in `.env` to point elsewhere.
