<p align="center">
  <a href="https://instantdb.com">
    <img alt="Shows the Instant logo" src="https://instantdb.com/img/icon/android-chrome-512x512.png" width="10%">
  </a>
  <h1 align="center">@instantdb/mcp</h1>
</p>

<p align="center">
  <a
    href="https://discord.com/invite/VU53p7uQcE" >
    <img height=20 src="https://img.shields.io/discord/1031957483243188235" />
  </a>
  <img src="https://img.shields.io/github/stars/instantdb/instant" alt="stars">
</p>

<p align="center">
   <a href="https://www.instantdb.com/docs/backend">Get Started</a> ·
   <a href="https://instantdb.com/examples">Examples</a> ·
   <a href="https://instantdb.com/tutorial">Try the Demo</a> ·
   <a href="https://www.instantdb.com/docs/backend">Docs</a> ·
   <a href="https://discord.com/invite/VU53p7uQcE">Discord</a>
<p>

Welcome to [Instant's](http://instantdb.com) MCP server.

# Instant MCP

This MCP is a wrapper around the Instant Platform SDK. Add this MCP to your
editor to enable creating, managing, and updating your InstantDB applications.

## Remote MCP server

Instant hosts the latest version of the server at `https://mcp.instantdb.com`.

For modern clients that support streamable HTTP use `https://mcp.instantdb.com/mcp`.

For legacy clients that require SSE use `https://mcp.instantdb.com/sse`.

For more editor-specific instructions, see [the public docs](https://www.instantdb.com/docs/using-llms).

## Local MCP server

If you haven't already, make sure to get a [personal access token from your Instant dashboard](https://www.instantdb.com/dash?s=personal-access-tokens).

Run the server in stdio mode with `npx -y @instantdb/mcp --token <token>`.

For more editor-specific instructions, see [the public docs](https://www.instantdb.com/docs/using-llms).

# Contributing

## Quick Start

Clone this repo and use the MCP Inspector `@modelcontextprotocol/inspector` to debug and
develop against this server locally.

```bash
# Clone this repo
git clone ..

# Navigate to the cloned directory and build the MCP server
cd ..
npm run build

# Run the server
npx @modelcontextprotocol/inspector node ./dist/index.js --token <token>

# Or alternatively via environment variable
INSTANT_ACCESS_TOKEN=<token> npx @modelcontextprotocol/inspector node ./build/index.js

# You can also specify a url to connect to a local instance of your instant server
npx @modelcontextprotocol/inspector node ./dist/index.js --token <token> --api-url
http://localhost:8888
```

You can also configure your editor or Claude to connect to your local MCP.
Here's an example configuration for MacOS/Linux:

```json
{
  "mcpServers": {
    "instant": {
      "command": "node",
      "args": [
        "<path-to-your-cloned-repo>/dist/index.js",
        "--token",
        "<token>",
        "--api-url",
        "http://localhost:8888"
      ]
    }
  }
}
```

### Remote MCP

```bash
cp .env.example .env
```

Fill in all of the environment variables for your new `.env` file.

```bash
pnpm run dev
```

Visit the server at [http://localhost:3123](http://localhost:3123).

To work on the `stdio` version of the codebase, update your `.env` file with `SERVER_TYPE=stdio`.
