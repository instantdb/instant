# Instant LLM Rules Template

This directory contains a template and an example app to generate LLM rules
files

## Updating LLM rules

`llm-rules-template.md` is the source of truth for generating our rule files.
See instructions in the file for how to update it!

## Example app

The example app demonstrate the following features of Instant:

- Initiailizes a connection to InstantDB
- Defines schema and permissions for the app
- Authentication with magic codes
- Reads and writes data via `db.useQuery` and `db.transact`
- Ephemeral features like who's online and shout
- File uploads for avatars

Logic is split across four files:

- `lib/db.ts`
- `instant.schema.ts`
- `instant.perms.ts`
- `app/page.tsx`

## See the example app live

You can see the tool at `/intern/llm-example`.

## Export the app locally

To get the docs feedback app data locally, run our export script from the server
repo

```
scripts/export.sh --email 'your-email-address' --app-id f22e6525-c977-4879-8d7d-9b3cbeaa7344
```

## Updating schema/perms

First update locally to test changes

```
INSTANT_CLI_DEV=1 pnpx instant-cli@latest push --app f22e6525-c977-4879-8d7d-9b3cbeaa7344
```

Once everything looks good you can push to prod

```
pnpx instant-cli@latest push --app f22e6525-c977-4879-8d7d-9b3cbeaa7344
```
