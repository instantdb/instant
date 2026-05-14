import fs from 'fs/promises';
import path from 'path';

export default async function generateMarkdown(app: {
  id: string;
  adminToken: string;
}): Promise<string> {
  const baseRules = await loadBaseRules();

  return `
A new Instant app has just been provisioned for you!

Here's the info:

\`\`\`
VITE_INSTANT_APP_ID=${app.id}
NEXT_PUBLIC_INSTANT_APP_ID=${app.id}
INSTANT_ADMIN_TOKEN=${app.adminToken}
\`\`\`

Now you can use this to build a full-stack app.

If you can't use npx/pnpm dlx/bunx to install packages you can use the unpkg CDN url: https://www.unpkg.com/@instantdb/react@latest/dist/standalone/index.umd.cjs

What follows are instructions for using Instant. Follow them, and you are golden!
---

${baseRules}`;
}

// ----------
// Base Rules

const RULES_PATH = path.join(
  process.cwd(),
  'lib',
  'intern',
  'instant-rules.md',
);

let cachedBaseRules: string | null = null;
async function loadBaseRules(): Promise<string> {
  if (cachedBaseRules !== null) return cachedBaseRules;
  const contents = await fs.readFile(RULES_PATH, 'utf8');
  cachedBaseRules = contents;
  return contents;
}
