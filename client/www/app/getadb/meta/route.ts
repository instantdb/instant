import { randomUUID } from 'crypto';
import { createApp } from '../createApp';
import generateMetaMarkdown from './generateMarkdown';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const token = process.env.GET_A_DB_PERSONAL_ACCESS_TOKEN;
  if (!token) {
    throw new Error('GET_A_DB_PERSONAL_ACCESS_TOKEN is not set');
  }

  const title =
    new URL(request.url).searchParams.get('title')?.trim() || DEFAULT_APP_TITLE;
  const app = await createApp(token, title);
  const markdown = await generateMetaMarkdown(app);

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

const DEFAULT_APP_TITLE = 'Instant Meta App';
