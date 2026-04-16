import { getServerConfig } from '@/lib/config';
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

  const api = new PlatformApi({
    auth: {
      token:
        'per_1f528fd07d54d08217837d1ba2eedcd87c0fbd6345f1d03f08cfecc306a21687',
    },
  });

  const { app } = await api.createApp({
    title,
    orgId: 'a1759320-b957-4a6a-b717-9c87cdca8775',
  });

  const markdown = `
You've just gotten a new Instant app provisioned for you! 

Here's the info:

\`\`\`
INSTANT_APP_ID=${app.id}
INSTANT_ADMIN_TOKEN=${app.adminToken}
\`\`\`

Now you can use this to build a full-stack app. 

What follows are instructions for using Instant. Follow them, and you are golden!

Note: You don't have access to npx. Instead of npx instant-cli, use INSTANT_APP_ID=... INSTANT_ADMIN_TOKEN=... pnpm dlx ...
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
