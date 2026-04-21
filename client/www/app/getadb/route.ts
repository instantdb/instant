import { agentMarkdownResponse } from './markdown';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NON_BROWSER_UA =
  /curl|wget|httpie|python-requests|python-urllib|Go-http-client|node-fetch|libcurl/i;

function looksLikeBrowser(request: Request): boolean {
  const accept = request.headers.get('accept') ?? '';
  const ua = request.headers.get('user-agent') ?? '';
  return accept.includes('text/html') && !NON_BROWSER_UA.test(ua);
}

export async function GET(request: Request) {
  if (looksLikeBrowser(request)) {
    return new Response(null, {
      status: 303,
      headers: {
        Location: '/human',
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  }
  return agentMarkdownResponse(request);
}
