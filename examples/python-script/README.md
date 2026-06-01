# Welcome to your InstantDB Python script 👋

[InstantDB Docs](https://www.instantdb.com/docs/start-python)

This is a Python script scaffolded with create-instant-app.

To install dependencies:
`uv sync`

To run the script:
`uv run --env-file .env python main.py`

To push schema and permission changes (requires Node):
`npx instant-cli push`

The Python SDK has no codegen step. `instant.schema.ts` and
`instant.perms.ts` are included so you can manage your app with the
Instant CLI.

Got any feedback or questions? Join our [Discord](https://discord.gg/hgVf9R6SBm)
