![](/img/showcase/chat_preview.png 'IRC style chat with guest login!')

# Quickstart

Clone the repo and install dependencies:

```bash
# Clone repo
git clone https://github.com/instantdb/instant-examples

# Navigate into the chat example
cd instant-examples/chat

# Install dependencies
pnpm i
```

If you haven't already, be sure to log into the Instant CLI

```bash
pnpx instant-cli login
```

Create a new app in the [Instant Dashboard](https://www.instantdb.com/dash)
and copy the `INSTANT_APP_ID` and `INSTANT_APP_ADMIN_TOKEN` into your `.env` file.

```bash
# Copy .env.example to .env and update the variables
# by creating a new app at https://www.instantdb.com/dash
cp .env.example .env
```

We've provided a schema in `instant.schema.ts` that you can push to your app via
the CLI:

```bash
pnpx instant-cli push
```

Run the seed script to populate the database with some initial data:

```bash
pnpm run seed
```

Finally, run the development server:

```bash
pnpm run dev
```
