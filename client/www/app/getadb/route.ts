import { agentMarkdown } from './markdown';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const headers = Object.fromEntries(request.headers.entries());
  console.log('[getadb] request headers', JSON.stringify(headers));
  const markdown = await agentMarkdown(request);
  return new Response(markdown, {
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Disposition': 'inline; filename="AGENTS.md"',
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
}
