import fs from 'fs/promises';
import path from 'path';

type Requester = 'figmaMake' | 'unknown';

export default async function generateMarkdown(
  request: Request,
  app: { id: string; adminToken: string },
  opts: {
    requester?: Requester;
    includeFullDocs?: boolean;
  } = {},
): Promise<string> {
  const requester = opts.requester ?? detectRequester(request);
  const baseRules = await loadBaseRules();
  const fullDocs = opts.includeFullDocs ? await loadFullDocs() : null;

  const extraRules =
    requester === 'figmaMake' ? `\n${FIGMA_MAKE_EXTRA_RULES}\n` : '';
  const docsSection = fullDocs
    ? `\n---\n\nCurrent Instant docs:\n\n${fullDocs}`
    : '';

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

${baseRules}${docsSection}`;
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
- Do not use environment variables for the app id. Hardcode the Instant app id directly in the client setup.
- When you need auth, use Instant's Guest Auth (\`signInAsGuest\`) unless the human asks for a different auth provider.
- Use \`pnpm dlx\` instead of \`npx\`.
- Do not hallucinate Instant APIs. Read the relevant docs before writing schema, permissions, queries, transactions, auth, storage, presence, or streams.
`;

// ----------
// Base Rules

const RULES_PATH = path.join(
  process.cwd(),
  'lib',
  'intern',
  'instant-rules.md',
);
const FULL_DOCS_PATH = path.join(process.cwd(), 'public', 'llms-full.txt');

let cachedBaseRules: string | null = null;
async function loadBaseRules(): Promise<string> {
  if (cachedBaseRules !== null) return cachedBaseRules;
  const contents = await fs.readFile(RULES_PATH, 'utf8');
  cachedBaseRules = contents;
  return contents;
}

let cachedFullDocs: string | null = null;
async function loadFullDocs(): Promise<string> {
  if (cachedFullDocs !== null) return cachedFullDocs;
  const contents = await fs.readFile(FULL_DOCS_PATH, 'utf8');
  cachedFullDocs = contents;
  return contents;
}
