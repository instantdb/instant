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

Logic is split across three files:

- `lib/db.ts`
- `instant.schema.ts`
- `app/page.tsx`

## See the example app live

You can see the tool at `/intern/llm-example`.
