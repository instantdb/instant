import { randomUUID } from 'crypto';
import { createGDBApp } from '../createGDBApp';
import generateMarkdown from '../generateMarkdown';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const title =
    new URL(request.url).searchParams.get('title')?.trim() || DEFAULT_APP_TITLE;
  const app = await createGDBApp(title);
  const markdown = await generateMarkdown(request, app, {
    requester: 'figmaMake',
    includeFullDocs: true,
  });

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

const DEFAULT_APP_TITLE = 'Instant Figma Make App';
