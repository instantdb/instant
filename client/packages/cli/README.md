<p align="center">
  <a href="https://instantdb.com">
    <img alt="Shows the Instant logo" src="https://instantdb.com/img/icon/android-chrome-512x512.png" width="10%">
  </a>
  <h1 align="center">instant-cli (beta)</h1>
</p>

<p align="center">
  <a 
    href="https://discord.com/invite/VU53p7uQcE" >
    <img height=20 src="https://img.shields.io/discord/1031957483243188235" />
  </a>
  <img src="https://img.shields.io/github/stars/instantdb/instant" alt="stars">
</p>

<p align="center">
   <a href="https://www.instantdb.com/docs/start-vanilla">Get Started</a> ·
   <a href="https://instantdb.com/examples">Examples</a> ·
   <a href="https://www.instantdb.com/docs/start-vanilla">Docs</a> ·
   <a href="https://discord.com/invite/VU53p7uQcE">Discord</a>
<p>

Welcome to [Instant's](http://instantdb.com) command line tool. You can create apps, write schema, and push permissions.

```javascript
npx instant-cli init
```

## Get Started

Start by peeking at the [instant-cli docs](https://www.instantdb.com/docs/cli).

# Contributing

Here's how to set up a local development environment for instant-cli.

## Quick Start

```bash
Clone this repo
git clone ..

# If you made any backend changes, run the server locally in a separate terminal
cd server
make dev

# Add --filter instant-cli to the 'dev' script in client/package.json to include
# instant-cli in the dev process
"dev": "turbo run dev ... --filter instant-cli"

# Now run the client to listen to cli changes
cd client
make dev

# Now go into a place where you can test out the CLI in your terminal
cd client/sandbox/cli-nodejs
INSTANT_CLI_DEV=1 npx instant-cli ...
```

# Questions?

If you have any questions, feel free to drop us a line on our [Discord](https://discord.com/invite/VU53p7uQcE)
