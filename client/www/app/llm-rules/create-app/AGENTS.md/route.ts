import { getServerConfig } from '@/lib/config';
import { PlatformApi } from '@instantdb/platform';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RULES_PATH = path.join(process.cwd(), 'lib', 'intern', 'instant-rules.md');
const DEFAULT_APP_TITLE = 'instant-agent-app';

export async function GET(request: Request) {
  const title =
    new URL(request.url).searchParams.get('title')?.trim() ||
    DEFAULT_APP_TITLE;
  const baseRules = await fs.readFile(RULES_PATH, 'utf8');
  const { apiURI } = await getServerConfig();
  const api = new PlatformApi({ apiURI });
  const { app, expiresMs } = await api.createTemporaryApp({ title });

  const markdown = `# Instant App

Use this Instant app for the current session.

- App ID: \`${app.id}\`
- Admin Token: \`${app.adminToken}\`
- Expires At: \`${new Date(expiresMs).toISOString()}\`

## Environment

\`\`\`env
NEXT_PUBLIC_INSTANT_APP_ID=${app.id}
INSTANT_APP_ADMIN_TOKEN=${app.adminToken}
\`\`\`

This app is ephemeral. If it expires, create a new one from this URL.

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
