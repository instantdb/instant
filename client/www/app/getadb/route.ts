import fs from 'fs/promises';
import path from 'path';
import config from '@/lib/config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RULES_PATH = path.join(
  process.cwd(),
  'lib',
  'intern',
  'instant-rules.md',
);

const DEFAULT_APP_TITLE = 'Get A DB App';

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
  const res = await fetch(`${config.apiURI}/dash/apps/get_a_db`, {
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

export async function GET(request: Request) {
  const title =
    new URL(request.url).searchParams.get('title')?.trim() || DEFAULT_APP_TITLE;
  const baseRules = await loadBaseRules();

  const token = process.env.GET_A_DB_PERSONAL_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      'GET_A_DB_PERSONAL_ACCESS_TOKEN is not set',
    );
  }

  const app = await createGetADbApp(token, title);

  const markdown = `
A new Instant app has just been provisioned for you!

Here's the info:

\`\`\`
VITE_INSTANT_APP_ID=${app.id}
NEXT_PUBLIC_INSTANT_APP_ID=${app.id}
INSTANT_ADMIN_TOKEN=${app.adminToken}
\`\`\`

Now you can use this to build a full-stack app.

What follows are instructions for using Instant. Follow them, and you are golden!

---

${baseRules}`;

  return new Response(markdown, {
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Disposition': 'inline; filename="AGENTS.md"',
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
}
