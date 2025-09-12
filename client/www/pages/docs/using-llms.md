---
title: Using Instant with LLMs
description: How to use Instant with LLMs
---

You can supercharge your Instant experience by using it with LLMs. For best
results we recommend doing two things:

- Add rules or context to your LLM to help it understand how Instant works
- Use the Instant MCP server to enable LLMs to create and update your apps

## Instant Rules

We've created a set of rules to help LLMs understand how Instant works. If you
start a new project with `create-instant-app` you'll get these rules
automatically. If you have an existing project you can add the rules manually by
reading below.

You can verify you set up the rules correctly by asking your LLM "How do you
make queries and transactions in InstantDB?" If everything is set up correctly,
you should see a response with information about `db.useQuery` and `transact`

### Cursor

Save [these rules](/mcp-tutorial/cursor-rules.md) at the root of your project in
`.cursor/rules/instant.mdc` You may need to restart Cursor for them to take
effect.

When using Cursor we recommend turning off "Auto" and using at least Claude
Sonnet 4

### Claude Code

Save [these instructions](/mcp-tutorial/claude.md) at the root of your
project in `CLAUDE.md` and [these rules](/mcp-tutorial/claude-rules.md) in `instant-rules.md`. If you already had claude running, restart it for the rules to take effect.

### Windsurf

Save [these rules](/mcp-tutorial/windsurf-rules.md) at the root of your project in `.windsurf/rules/instant.md`. You may need to restart Windsurf for them to take effect.

### Zed

Save [these rules](/mcp-tutorial/other-rules.md) at the root of your project in `AGENT.md`. You may need to restart Zed for them to take effect.

### Other Tools

Use [these rules](/mcp-tutorial/other-rules.md) to give context on how to use
Instant. If want to manually add in more documentation, you can also append
`.md` to the end of any doc page url to get the raw markdown

### Markdown Docs and llms.txt

You can attach `.md` to the end of any doc page url to get raw markdown. This can be helpful to paste into your LLM if you're stuck on
particular functionality. For example, here's the recommended docs for [adding auth](/docs/auth/magic-codes.md.md)

We recommend starting with the rules files above and adding more docs as needed.
If you want though you can get all our docs at once in markdown format via
[llms-full.txt](https://www.instantdb.com/llms-full.txt)

## Instant MCP Server

We built [`@instantdb/mcp`](https://github.com/instantdb/instant/tree/main/client/packages/mcp) to enable creating, managing, and updating your Instant apps.
Combine the MCP with our rules file to build full-stack apps directly in your editor.

The easiest way to get started is to use our hosted remote MCP server. Use the
instructions below to add the Instant MCP server to your favorite LLM editor or tool.

{% callout type="note" %}

When you add the MCP server, you'll be sent through an OAuth flow to grant access to your Instant Account.

{% /callout %}

### Cursor

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=InstantDB&config=eyJ1cmwiOiJodHRwczovL21jcC5pbnN0YW50ZGIuY29tL21jcCJ9)

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

### Claude Code

If you're on a paid Claude plan, you can add the the server via the command line

```text {% showCopy="true" %}
claude mcp add instant -s user -t http https://mcp.instantdb.com/mcp
```

Now you run `claude` to start Claude Code and then run `/mcp` to see your list
of MCP servers. `instant` should be listed there. Select it and go through the
auth flow to enable the Instant MCP server in your claude code sessions!

### Windsurf

You can add the Instant MCP server through the Windsurf UI

1. Open Windsurf Settings.
2. Under Cascade, you'll find Model Context Protocol Servers.
3. Select Add Server and paste the relevant snippet for your OS.

Alternatively you can directly edit your `~/.codeium/windsurf/mcp_config.json`

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

Open your Zed settings and add the following

```json {% showCopy="true" %}
{
  "context_servers": {
    "instant": {
      "command": {
        "path": "npx",
        "args": ["-y", "mcp-remote", "https://mcp.instantdb.com/mcp"],
        "env": {}
      },
      "settings": {}
    }
  }
}
```

### Other Tools

For other tools that support MCP servers, you can configure Instant using either our streamable HTTP
endpoint (recommended if your tool supports it)

```text {% showCopy="true" %}
https://mcp.instantdb.com/mcp
```

Or our SSE endpoint

```text {% showCopy="true" %}
https://mcp.instantdb.com/sse
```

## Local MCP server

We recommend using our hosted MCP server but we also support running [`@instantdb/mcp`](https://github.com/instantdb/instant/tree/main/client/packages/mcp) locally
via `stdio`. This will avoid OAuth but requires you to manage your personal
access token.

### Get your Personal Access Token

If you haven't already, make sure to get a personal access token from your
[Instant dashboard](https://www.instantdb.com/dash?s=personal-access-tokens)

Once you have your token, you can set up the local Instant MCP server in your
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
