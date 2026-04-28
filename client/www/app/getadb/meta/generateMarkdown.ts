import fs from 'fs/promises';
import path from 'path';
import type { ProvisionedApp } from '../createGDBApp';

export default async function generateMetaMarkdown(
  app: ProvisionedApp,
): Promise<string> {
  const rules = (await loadRules()).replaceAll('__INSTANT_APP_ID__', app.id);

  return `
A new Instant app has just been provisioned for you!

Here's the info:

\`\`\`
VITE_INSTANT_APP_ID=${app.id}
NEXT_PUBLIC_INSTANT_APP_ID=${app.id}
INSTANT_ADMIN_TOKEN=${app.adminToken}
\`\`\`

Now you can use this to build a full-stack app.

What follows are instructions for using Instant with React in a no-build HTML
app. Follow them, and you are golden!
---

${rules}`;
}

const RULES_PATH = path.join(
  process.cwd(),
  'app',
  'getadb',
  'meta',
  'meta-react-instant-rules.md',
);

let cachedRules: string | null = null;
async function loadRules(): Promise<string> {
  if (cachedRules !== null) return cachedRules;
  const contents = await fs.readFile(RULES_PATH, 'utf8');
  cachedRules = contents;
  return contents;
}
