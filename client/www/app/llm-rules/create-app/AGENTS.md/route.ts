import { PlatformApi } from '@instantdb/platform';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RULES_PATH = path.join(
  process.cwd(),
  'lib',
  'intern',
  'instant-rules.md',
);
const DEFAULT_APP_TITLE = 'instant-agent-app';

const baseRulesPromise = fs.readFile(RULES_PATH, 'utf8');

export async function GET(request: Request) {
  const title =
    new URL(request.url).searchParams.get('title')?.trim() || DEFAULT_APP_TITLE;
  const baseRules = await baseRulesPromise;

  const token = process.env.INSTANT_LLM_RULES_CREATE_APP_PERSONAL_ACCESS_TOKEN;
  const orgId = process.env.INSTANT_LLM_RULES_CREATE_APP_ORG_ID;
  if (!token) {
    throw new Error(
      'INSTANT_LLM_RULES_CREATE_APP_PERSONAL_ACCESS_TOKEN is not set',
    );
  }
  if (!orgId) {
    throw new Error('INSTANT_LLM_RULES_CREATE_APP_ORG_ID is not set');
  }

  const api = new PlatformApi({ auth: { token } });

  const { app } = await api.createApp({ title, orgId });

  const markdown = `
You've just gotten a new Instant app provisioned for you! 

Here's the info:

\`\`\`
VITE_INSTANT_APP_ID=${app.id}
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
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
