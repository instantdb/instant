# Instant MCP

This MCP is a wrapper around the Instant Platform SDK. Add this MCP to your
editor to enable creating, managing, and updating your InstantDB applications,

## Setup Instructions

If you haven't already make sure to get a personal access token from your
[Instant dashboard](https://www.instantdb.com/dash?s=personal-access-tokens)

Once you have your token, you can set up the Instant MCP server in your
favorite editor with MCP support.

### Cursor/Windsurf/Cline

You can set up the Instant MCP server in Cursor, Windsurf, or Cline by adding
the following configuration to your MCP settings:

**MacOS/Linux**

```json
{
  "mcpServers": {
    "instant": {
      "command": "npx",
      "args": ["-y", "@instantdb/mcp", "--token", "<token>"]
    }
  }
}
```

**Windows**

```json
{
  "mcpServers": {
    "instant": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@instantdb/mcp", "--token", "<token>"]
    }
  }
}
```

**Windows WSL**

```json
{
  "mcpServers": {
    "supabase": {
      "command": "wsl",
      "args": ["npx", "-y", "@instantdb/mcp", "--token", "<token>"]
    }
  }
}
```

Replacing `<token>` with your personal access token. Save the file and reload
the editor! You should now see the Instant MCP server active and enabled!

### Zed

Open your Zed settings and add the following

```json
{
  "context_servers": {
    "linear": {
      "command": {
        "path": "npx",
        "args": ["-y", "@instantdb/mcp", "--token", "<token>"],
        "env": {}
      },
      "settings": {}
    }
  }
}
```

Replacing `<token>` with your personal access token. Save the file and reload the editor.
You should now see the Instant MCP server active and enabled!

### Claude Desktop

You can set up the Instant MCP server in Claude Desktop by following these
steps:

1. Open the file `~/Library/Application Support/Claude/claude_desktop_config.json`
2. Add the following configuration to the `claude_desktop_config.json` file:

```json
{
  "mcpServers": {
    "instant": {
      "command": "npx",
      "args": ["-y", "@instantdb/mcp", "--token", "<token>"]
    }
  }
}
```

Replacing `<token>` with your personal access token. Save the file and restart
Claude Desktop. You should now see the Instant MCP server active and enabled!

## Available Tools

Below is a list of the current tools we expose

**App Management**

- `create-app` Creates a new InstantDB application with optional schema and permissions.
- `get-apps` Lists all apps owned by the authenticated user.
- `get-app` Fetches a single app by ID.

**Schema Management**

- `get-schema` Retrieves the schema for a specific app.
- `plan-schema-push` Dry-run a schema update to preview changes.
- `push-schema` Applies schema changes to an app. Run `plan-schema-push` first to preview.

**Permissions Management**

- `get-perms` Retrieves permission rules for an app.
- `push-perms` Updates permission rules for an app.

## Adding context to your LLM

[Use our rules file](https://instantdb.com/rules.txt) to give your LLM context on how to use Instant for things
like queries, transactions, authentication, and more.

## Example Conversation

```
User: Could we add a new projects table with a link to todos for my app id
<app_id>

LLM: I'll help you add a new projects table with a link to todos for your app.
Let me first get the current schema to understand the existing structure.

Tool-call: get-schema

LLM: Now I'll create a plan to add the projects entity and create a link
between projects and todos. Let me first create a dry-run to show you what
changes will be made:

Tool-call: plan-schema-push

LLM: Perfect! The plan looks good. It will:

// .. info about the planned changes

Now let's execute this schema update:

Tool-call: push-schema

Excellent! The schema update has been successfully completed.

// .. info about the pushed changes
```

## Develop with MCP Inspector

To develop and debug against the Instant MCP server, you can use the MCP
Inspector `@modelcontextprotocol/inspector`

```bash
# Clone this repo
git clone ..

# Navigate to the cloned directory and build the MCP server
cd ..
npm run build

## Run the server
npx @modelcontextprotocol/inspector node ./dist/index.js --token <token>

## Or alternatively via environment variable
INSTANCE_ACCESS_TOKEN=<token> npx @modelcontextprotocol/inspector node ./build/index.js

## You can also specify a url to connect to a local instance of your instant server
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
