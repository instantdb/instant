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

Now let's initialize a new app with the Instant CLI.

```bash
pnpx instant-cli init
```

We've provided a schema in `instant.schema.ts` that you can push to your app.
You may have already pushed this during `init` in the previous step. If you
answered 'no' to the prompt during init, or if you're unsure whether you pushed
the schema, you can push it now.

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
