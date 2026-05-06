import { type NextRequest, NextResponse } from 'next/server';

const GETADB_HOSTS = new Set([
  'getadb.com',
  'www.getadb.com',
  'getadb.localhost',
]);

export function middleware(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').split(':')[0];
  if (!GETADB_HOSTS.has(host)) return NextResponse.next();

  const url = request.nextUrl.clone();

  if (url.pathname === '/new') {
    url.pathname = '/provision/new';
    return NextResponse.redirect(url, 307);
  }

  if (url.pathname === '/') {
    // Browser → human page; curl/agent → markdown guide.
    // Sec-Fetch-Mode is sent by all modern browsers
    // (Chrome 76+, Firefox 90+, Safari 16.4+); agents like curl and
    // Claude's fetch tool don't send it.
    const isBrowser = request.headers.has('sec-fetch-mode');
    url.pathname = isBrowser ? '/getadb' : '/getadb/guide';
  } else {
    url.pathname = `/getadb${url.pathname}`;
  }
  return NextResponse.rewrite(url);
}

export const config = {
  // Skip Next internals, API routes, and top-level /public/ asset folders so
  // middleware doesn't rewrite their paths under /getadb/* on the getadb host.
  matcher: [
    '/((?!_next|api|fonts|img|audio|marketing|posts|readmes|video-previews|llm-rules).*)',
  ],
};
