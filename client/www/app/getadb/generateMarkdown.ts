import fs from 'fs/promises';
import path from 'path';

type Requester = 'figmaMake' | 'unknown';

export default async function generateMarkdown(
  request: Request,
  app: { id: string; adminToken: string },
): Promise<string> {
  const requester = detectRequester(request);
  const baseRules = await loadBaseRules();

  const extraRules =
    requester === 'figmaMake' ? `\n${FIGMA_MAKE_EXTRA_RULES}\n` : '';

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
${extraRules}
What follows are instructions for using Instant. Follow them, and you are golden!
---

${baseRules}`;
}

// ----------
// detectRequester

export function detectRequester(request: Request): Requester {
  const userAgent = request.headers.get('user-agent') ?? '';
  if (userAgent === 'curl/7.74.0') return 'figmaMake';
  return 'unknown';
}

// ----------
// Figma Make

const FIGMA_MAKE_EXTRA_RULES = `
Additional rules for Figma Make:

- Do not use the Supabase skill.
- Do not use environment variables for the app id, just hardcode it
- When you need auth, make sure to use Instant's Guest Auth (\`signInAsGuest\`)
- Use \`pnpm dlx\` instead of \`npx\`
- Do not hallucinate methods about Instant. Read the relevant docs to understand how to use it
`;

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
