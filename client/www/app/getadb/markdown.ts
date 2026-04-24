import fs from 'fs/promises';
import path from 'path';
import { getServerConfig } from '@/lib/config';
import { detectRequester } from './detect-requester';

const RULES_PATH = path.join(
  process.cwd(),
  'lib',
  'intern',
  'instant-rules.md',
);

const DEFAULT_APP_TITLE = 'Instant App';

const FIGMA_MAKE_EXTRA_RULES = `
Additional rules for Figma Make:

- Do not use the Supabase skill.
- Do not use environment variables for the app id, just hardcode it
- When you need auth, make sure to use Instant's Guest Auth (\`signInAsGuest\`)
- Use \`pnpm dlx\` instead of \`npx\`
- Do not hallucinate methods about Instant. Read the relevant docs to understand how to use it
`;

let cachedBaseRules: string | null = null;
async function loadBaseRules(): Promise<string> {
  if (cachedBaseRules !== null) return cachedBaseRules;
  const contents = await fs.readFile(RULES_PATH, 'utf8');
  cachedBaseRules = contents;
  return contents;
}

async function createGetADbApp(
  token: string,
  title: string,
): Promise<{ id: string; adminToken: string }> {
  const { apiURI } = await getServerConfig();
  const res = await fetch(`${apiURI}/dash/apps/get_a_db`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) {
    throw new Error(
      `Failed to create get-a-db app: ${res.status} ${await res.text()}`,
    );
  }
  const body = (await res.json()) as {
    app: { id: string; 'admin-token': string };
  };
  return { id: body.app.id, adminToken: body.app['admin-token'] };
}

export async function agentMarkdown(request: Request): Promise<string> {
  const token = process.env.GET_A_DB_PERSONAL_ACCESS_TOKEN;
  if (!token) {
    throw new Error('GET_A_DB_PERSONAL_ACCESS_TOKEN is not set');
  }

  const title =
    new URL(request.url).searchParams.get('title')?.trim() || DEFAULT_APP_TITLE;
  const baseRules = await loadBaseRules();

  const app = await createGetADbApp(token, title);
  const requester = detectRequester(request);
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
