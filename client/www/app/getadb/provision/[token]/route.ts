import { randomUUID } from 'crypto';
import { getServerConfig } from '@/lib/config';
import generateMarkdown from '../../generateMarkdown';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PLACEHOLDER_TOKEN = '<generate-a-random-16-char-token>';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: urlToken } = await params;

  // Catch agents that fetched the URL verbatim without replacing the
  // placeholder.
  if (urlToken === PLACEHOLDER_TOKEN) {
    return new Response(placeholderNotReplacedMarkdown(), {
      status: 400,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  const token = process.env.GET_A_DB_PERSONAL_ACCESS_TOKEN;
  if (!token) {
    throw new Error('GET_A_DB_PERSONAL_ACCESS_TOKEN is not set');
  }
  const title =
    new URL(request.url).searchParams.get('title')?.trim() || DEFAULT_APP_TITLE;
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

function placeholderNotReplacedMarkdown(): string {
  return `You fetched the provision URL without replacing the placeholder.

"${PLACEHOLDER_TOKEN}" is a placeholder. Generate a random 16-character
token yourself and put it in the URL in place of the placeholder. Each
fetch must use a different random token so upstream caches never serve
stale credentials.
`;
}

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
