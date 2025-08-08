# Instant LLM Example App

This is an example app that we feed into our rules files for LLMs to learn how
to use InstantDB.

This combines Instant, Next.js, and TailwindCSS to show how to build an app with
the following features:

- Initiailizes a connection to InstantDB
- Defines schema and permissions for the app
- Authentication with magic codes
- Reads and writes data via `db.useQuery` and `db.transact`
- Ephemeral features like who's online and shout
- File uploads for avatars

Logic is split across four files:

- `app/page.tsx` - Main logic, mostly UI with some Instant magic :)
- `lib/db.ts` -- InstantDB client setup
- `instant.schema.ts` - InstantDB schema, gives you type safety for your data!

## See it live

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
