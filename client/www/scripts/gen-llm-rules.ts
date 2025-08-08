/**
 * Script for generating LLM rule files for agents. These files are used
 * in our MCP tutorial as our rule files for different LLMs.
 *
 * Edit the template constants below to update content in the generated files.
 *
 * We also have a full code example that is built from lib/intern/llm-example/
 *
 * If we need to update the example app code with new best practices we
 * should update the code in lib/intern/llm-example. Our build process will
 * include the updated code into the generated files.
 *
 * Output files are saved to public/mcp-tutorial/ directory:
 *
 * Usage: pnpm exec tsx scripts/gen-llm-rules.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function buildFullExampleApp(): string {
  const exampleDir = path.join(__dirname, '../lib/intern/llm-example');

  // Read all source files
  const dbFile = fs.readFileSync(path.join(exampleDir, 'lib/db.ts'), 'utf-8');
  const schemaFile = fs.readFileSync(
    path.join(exampleDir, 'instant.schema.ts'),
    'utf-8',
  );
  const permsFile = fs.readFileSync(
    path.join(exampleDir, 'instant.perms.ts'),
    'utf-8',
  );
  const pageFile = fs.readFileSync(
    path.join(exampleDir, 'app/page.tsx'),
    'utf-8',
  );

  // Fix the APP_ID line in db.ts
  const dbFileFixed = dbFile.replace(
    'process.env.NEXT_PUBLIC_LLM_EXAMPLE_APP_ID!',
    'process.env.NEXT_PUBLIC_INSTANT_APP_ID!',
  );

  return `# Full Example App

Below is a full demo app built with InstantDB, Next.js, and TailwindCSS with the following features:

- Initiailizes a connection to InstantDB
- Defines schema and permissions for the app
- Authentication with magic codes
- Reads and writes data via \`db.useQuery\` and \`db.transact\`
- Ephemeral features like who's online and shout
- File uploads for avatars

Logic is split across four files:

- \`lib/db.ts\` -- InstantDB client setup
- \`instant.schema.ts\` - InstantDB schema, gives you type safety for your data!
- \`instant.perms.ts\` - InstantDB permissions, not required for this app, but we still included to show how to restrict access to your data.
- \`app/page.tsx\` - Main logic, mostly UI with some Instant magic :)

\`\`\`typescript
/* FILE: lib/db.ts */
${dbFileFixed}
/* FILE: instant.schema.ts */
${schemaFile}
/* FILE: instant.perms.ts */
${permsFile}
/* FILE: app/page.tsx */
${pageFile}\`\`\``;
}
//
// ============= TEMPLATE CONSTANTS =============

const INTRO_BLOCK = `You are an expert developer who writes full-stack apps in InstantDB, Next.js, and Tailwind developer. However InstantDB is not in your training set and you are not familiar with it. Before you write ANY code you read ALL of instant-rules.md to understand how to use InstantDB in your code. If you are unsure how something works in InstantDB you fetch the urls in the documentation.

Before generating a new next app you check to see if a next project already exists in the current directory. If it does you do not generate a new next app.

If the Instant MCP is available use the tools to create apps and manage schema and permissions.`;

const INSTANT_BASICS = `# About InstantDB

Instant is the Modern Firebase. With Instant you can easily build realtime and
collaborative apps. You can get started for free at https://instantdb.com

# How to use Instant in projects

Instant offers client side javascript packages for vanilla JS, react,
and react native. Instant also offers a javascript admin SDK that can be used on
the backend.

If you want to use Instant with react you should only use \`@instantdb/react\`. For react-native you should
only use \`@instantdb/react-native\`. For the admin SDK you should only use
\`@instantdb/admin\`. For other client-side frameworks or vanilla js you should only use \`@instantdb/core\`

You cannot use Instant on the backend outside of the admin SDK at the moment.`;

const FULL_EXAMPLE_APP = buildFullExampleApp();

const DOCUMENTATION_LINKS = `# Documentation

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
- [Storage](https://instantdb.com/docs/storage.md): How to upload and serve files with Instant.`;

// ============= BUILD FUNCTIONS =============

function buildClaudeMd(): string {
  return INTRO_BLOCK;
}

function buildClaudeRules(): string {
  return `${INSTANT_BASICS}

${FULL_EXAMPLE_APP}

${DOCUMENTATION_LINKS}`;
}

function buildCursorRules(): string {
  const frontmatter = `---
description:
globs:
alwaysApply: true
---`;

  return `${frontmatter}

${INTRO_BLOCK}

${INSTANT_BASICS}

${FULL_EXAMPLE_APP}

${DOCUMENTATION_LINKS}`;
}

function buildWindsurfRules(): string {
  const frontmatter = `---
trigger: always_on
description: How to use InstantDB
globs: ['**/*.tsx', '**/*.ts']
---`;

  return `${frontmatter}

${INTRO_BLOCK}

${INSTANT_BASICS}

${FULL_EXAMPLE_APP}

${DOCUMENTATION_LINKS}`;
}

function buildOtherRules(): string {
  return `${INTRO_BLOCK}

${INSTANT_BASICS}

${FULL_EXAMPLE_APP}

${DOCUMENTATION_LINKS}`;
}

// ============= MAIN FUNCTION =============

async function main() {
  const files = [
    // Claude is split into two files
    { filename: 'claude.md', build: buildClaudeMd },
    { filename: 'claude-rules.md', build: buildClaudeRules },

    { filename: 'cursor-rules.md', build: buildCursorRules },
    { filename: 'windsurf-rules.md', build: buildWindsurfRules },

    // This is our generic rules file for other LLMs
    { filename: 'other-rules.md', build: buildOtherRules },
  ];

  const OUTPUT_DIR = path.join(__dirname, '../public/mcp-tutorial');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (const { filename, build } of files) {
    const content = build();
    const outputPath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(outputPath, content);
    console.log(`✅ Generated: ${filename}`);
  }

  console.log(
    `\n📚 All ${files.length} LLM rule files generated successfully!`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Error generating LLM rule files:', error);
    process.exit(1);
  });
}
