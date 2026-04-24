import { randomUUID } from 'crypto';
import { customAlphabet } from 'nanoid';
import { getServerConfig } from '@/lib/config';
import generateMarkdown from './generateMarkdown';

// Base58 alphabet (omits confusable 0/O, I/l). Shorter and prettier than a
// UUID in the URL bar. See https://www.unkey.com/blog/uuid-ux
const nanoid = customAlphabet(
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',
  16,
);

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);

  // Redirect to a URL with a unique `n` so upstream fetchers (e.g. v0's
  // WebFetch) can't reuse a cached response across users.
  if (!url.searchParams.has('n')) {
    const redirectUrl = new URL(url);
    redirectUrl.searchParams.set('n', nanoid());
    return new Response(null, {
      status: 307,
      headers: {
        Location: redirectUrl.toString(),
        'Cache-Control':
          'private, no-store, no-cache, max-age=0, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        Vary: '*',
      },
    });
  }

  const token = process.env.GET_A_DB_PERSONAL_ACCESS_TOKEN;
  if (!token) {
    throw new Error('GET_A_DB_PERSONAL_ACCESS_TOKEN is not set');
  }
  const title = url.searchParams.get('title')?.trim() || DEFAULT_APP_TITLE;
  const app = await createApp(token, title);

  const markdown = await generateMarkdown(request, app);

  return new Response(markdown, {
    headers: {
      'Cache-Control':
        'private, no-store, no-cache, max-age=0, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      Vary: '*',
      ETag: `"${randomUUID()}"`,
      'Content-Disposition': 'inline; filename="AGENTS.md"',
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
}

const DEFAULT_APP_TITLE = 'Instant App';

async function createApp(
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
