# Instant MCP

This MCP is a wrapper around the Instant Platform SDK. Add this MCP to your
editor to enable creating, managing, and updating your InstantDB applications,

**This README contains info on how to locally develop against this MCP server. To
learn how to use this MCP in your own editor/apps, see [the public docs](https://www.instantdb.com/docs/using-llms)**

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
