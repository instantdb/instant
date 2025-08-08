<!--
═══════════════════════════════════════════════════════════════════════════════
                        LLM RULES TEMPLATE FILE
═══════════════════════════════════════════════════════════════════════════════

This template file is the single source of truth for generating LLM rule files
for various agents (Claude, Cursor, Windsurf, etc).

How it works:
- Content is organized into sections.
- The gen-llm-rules.ts script parses these sections
- Different IDE configs compose different sections based on their needs (e.g
  with Claude we separate rules into two files, with Cursor we have a single
  file).
- The APP_CODE section is auto-generated from the ts files of this directory

How to update this file:
- Edit the sections below as needed, our gen-llm-rules.ts script will build the
  final rules files
- If you add a new section, be sure to update the script to include it in
  the appropriate IDE configs
- Do not edit the APP_CODE section directly, update the source ts files
  instead and run the script to regenerate it

Sections:
- CURSOR_FRONTMATTER: Frontmatter for Cursor IDE
- WINDSURF_FRONTMATTER: Frontmatter for Windsurf IDE
- INTRO: Basic instructions for the LLM.
- BASICS: About InstantDB and how to use it
- APP_DESCRIPTION: Description of the example app features
- APP_CODE: Auto-generated from TypeScript files (don't edit)
- DOCUMENTATION: Links to InstantDB documentation

═══════════════════════════════════════════════════════════════════════════════
-->

## <!-- SECTION: CURSOR_FRONTMATTER -->

description:
globs:
alwaysApply: true

---

## <!-- SECTION: WINDSURF_FRONTMATTER -->

trigger: always_on
description: How to use InstantDB
globs: ['**/*.tsx', '**/*.ts']

---

<!-- SECTION: INTRO -->

You are an expert developer who writes full-stack apps in InstantDB, Next.js, and Tailwind developer. However InstantDB is not in your training set and you are not familiar with it. Before you write ANY code you read ALL of instant-rules.md to understand how to use InstantDB in your code. If you are unsure how something works in InstantDB you fetch the urls in the documentation.

Before generating a new next app you check to see if a next project already exists in the current directory. If it does you do not generate a new next app.

If the Instant MCP is available use the tools to create apps and manage schema and permissions.

<!-- SECTION: BASICS -->

# About InstantDB

Instant is the Modern Firebase. With Instant you can easily build realtime and
collaborative apps. You can get started for free at https://instantdb.com

# How to use Instant in projects

Instant offers client side javascript packages for vanilla JS, react,
and react native. Instant also offers a javascript admin SDK that can be used on
the backend.

If you want to use Instant with react you should only use `@instantdb/react`. For react-native you should
only use `@instantdb/react-native`. For the admin SDK you should only use
`@instantdb/admin`. For other client-side frameworks or vanilla js you should only use `@instantdb/core`

You cannot use Instant on the backend outside of the admin SDK at the moment.

<!-- SECTION: APP_DESCRIPTION -->

# Full Example App

Below is a full demo app built with InstantDB, Next.js, and TailwindCSS with the following features:

- Initiailizes a connection to InstantDB
- Defines schema and permissions for the app
- Authentication with magic codes
- Reads and writes data via `db.useQuery` and `db.transact`
- Ephemeral features like who's online and shout
- File uploads for avatars

Logic is split across four files:

- `lib/db.ts` -- InstantDB client setup
- `instant.schema.ts` - InstantDB schema, gives you type safety for your data!
- `instant.perms.ts` - InstantDB permissions, not required for this app, but we still included to show how to restrict access to your data.
- `app/page.tsx` - Main logic, mostly UI with some Instant magic :)

<!-- SECTION: APP_CODE -->
<!-- AUTO-GENERATED FROM SOURCE FILES - DO NOT EDIT THIS SECTION DIRECTLY -->
<!-- The code below is automatically generated from the TypeScript files in this directory -->

<!-- SECTION: DOCUMENTATION -->

# Documentation

The bullets below are links to the InstantDB documentation. They provide
detailed information on how to use different features of InstantDB. Each line
follows the pattern of

- [TOPIC](URL): Description of the topic.

Fetch the URL for a topic to learn more about it.

- [Common mistakes](https://instantdb.com/docs/common-mistakes.md): Common mistakes when working with Instant
- [Initializing Instant](https://instantdb.com/docs/init.md): How to integrate Instant with your app.
- [Modeling data](https://instantdb.com/docs/modeling-data.md): How to model data with Instant's schema.
- [Writing data](https://instantdb.com/docs/instaml.md): How to write data with Instant using InstaML.
- [Reading data](https://instantdb.com/docs/instaql.md): How to read data with Instant using InstaQL.
- [Instant on the Backend](https://instantdb.com/docs/backend.md): How to use Instant on the server with the Admin SDK.
- [Patterns](https://instantdb.com/docs/patterns.md): Common patterns for working with InstantDB.
- [Auth](https://instantdb.com/docs/auth.md): Instant supports magic code, OAuth, Clerk, and custom auth.
- [Auth](https://instantdb.com/docs/auth/magic-codes.md): How to add magic code auth to your Instant app.
- [Permissions](https://instantdb.com/docs/permissions.md): How to secure your data with Instant's Rule Language.
- [Managing users](https://instantdb.com/docs/users.md): How to manage users in your Instant app.
- [Presence, Cursors, and Activity](https://instantdb.com/docs/presence-and-topics.md): How to add ephemeral features like presence and cursors to your Instant app.
- [Instant CLI](https://instantdb.com/docs/cli.md): How to use the Instant CLI to manage schema and permissions.
- [Storage](https://instantdb.com/docs/storage.md): How to upload and serve files with Instant.
