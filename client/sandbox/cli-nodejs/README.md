<p align="center">
  <a href="#">
    <img alt="Shows the Instant logo" src="https://instantdb.com/img/icon/android-chrome-512x512.png" width="10%">
  </a>
  <h1 align="center">sandbox/cli-nodejs</h1>
</p>

This is sandbox app to play with [instant-cli](../../packages/cli/).

# Development

First, let's set up your environment. Create an Instant app, either on your local backend or prod, and fill out the token info in your `.env` file.

```bash
cp .env.example .env
# fill in the variables in .env
```

Now start the local server to build/watch package changes

```bash
# From the client root
make dev
```

Now you can run and test the cli tool!

```bash
# Pull the schema and permissions from your Instant app in prod
pnpm exec instant-cli pull

# Push the schema and permissions to your Instant app on the local backend
INSTANT_CLI_DEV=1 pnpm exec instant-cli pull
```

# Questions?

If you have any questions, feel free to drop us a line on our [Discord](https://discord.com/invite/VU53p7uQcE)!
