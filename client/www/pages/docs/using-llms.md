---
title: Using Instant with LLMs
description: How to use Instant with LLMs
---

Read below to learn how to use Instant with LLMs to build full-stack apps

## Instant Context Rules

To make it easier to use Instant with LLMs we've put together a [rules.txt](/rules.txt)
that you can paste or download to use as context.

You can also attach `.md` to the end of any doc page url to get the raw markdown
you can copy and paste into your LLM. For example, here's the [Getting
Started page](/docs.md)

## Instant MCP Server

We've also built [`@instantdb/mcp`](https://github.com/instantdb/instant/tree/main/client/packages/mcp) to enable creating, managing, and updating your Instant apps.
Combine the MCP with our rules file to build full-stack apps directly in your editor.

## Remote MCP server

We host the latest version of the MCP server at [https://mcp.instantdb.com](https://mcp.instantdb.com).

For modern clients that support streamable HTTP use:

```text {% showCopy="true" %}
https://mcp.instantdb.com/mcp
```

For legacy clients that require SSE use:

```text {% showCopy="true" %}
https://mcp.instantdb.com/sse
```

### Auth

When you add the MCP server, you'll be sent through an OAuth flow to grant access to your Instant Account.

### Cursor

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=InstantDB&config=eyJ1cmwiOiJodHRwczovL21jcC5pbnN0YW50ZGIuY29tL21jcCJ9)

Or edit your `~/.cursor/mcp.json` directly:

```json {% showCopy="true" %}
{
  "mcpServers": {
    "instant": {
      "url": "https://mcp.instantdb.com/mcp"
    }
  }
}
```

### Claude

If you're on a paid plan, go to Settings > Integrations. Add a custom integration and use the url:

```text {% showCopy="true" %}
https://mcp.instantdb.com/mcp
```

### Windsurf

Use the SSE endpoint for Windsurf with [`mcp-remote`](https://www.npmjs.com/package/mcp-remote).

Edit your `~/.codeium/windsurf/mcp_config.json`:

**MacOS/Linux**

```json {% showCopy="true" %}
{
  "mcpServers": {
    "instant": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.instantdb.com/sse"]
    }
  }
}
```

**Windows**

```json {% showCopy="true" %}
{
  "mcpServers": {
    "instant": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "mcp-remote", "https://mcp.instantdb.com/sse"]
    }
  }
}
```

**Windows WSL**

```json {% showCopy="true" %}
{
  "mcpServers": {
    "instant": {
      "command": "wsl",
      "args": ["npx", "-y", "mcp-remote", "https://mcp.instantdb.com/sse"]
    }
  }
}
```

### Zed

Use the SSE endpoint for Zed with [`mcp-remote`](https://www.npmjs.com/package/mcp-remote).

Open your Zed settings and add the following

```json {% showCopy="true" %}
{
  "context_servers": {
    "instant": {
      "command": {
        "path": "npx",
        "args": ["-y", "mcp-remote", "https://mcp.instantdb.com/sse"],
        "env": {}
      },
      "settings": {}
    }
  }
}
```

## Local MCP server

You can run [`@instantdb/mcp`](https://github.com/instantdb/instant/tree/main/client/packages/mcp) locally.

### Get your Personal Access Token

If you haven't already, make sure to get a personal access token from your
[Instant dashboard](https://www.instantdb.com/dash?s=personal-access-tokens)

Once you have your token, you can set up the Instant MCP server in your
favorite editor with MCP support.

### Cursor/Windsurf/Cline

You can set up the Instant MCP server in Cursor, Windsurf, or Cline by adding
the following configuration to your MCP settings:

**MacOS/Linux**

```json {% showCopy="true" %}
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

```json {% showCopy="true" %}
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

```json {% showCopy="true" %}
{
  "mcpServers": {
    "instant": {
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

```json {% showCopy="true" %}
{
  "context_servers": {
    "instant": {
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

```json {% showCopy="true" %}
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

## MCP Tools

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

### Example Conversation

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
