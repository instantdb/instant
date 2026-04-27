import { type NextRequest, NextResponse } from 'next/server';

const GETADB_HOSTS = new Set([
  'getadb.com',
  'www.getadb.com',
  'getadb.localhost',
]);

export function middleware(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').split(':')[0];
  const url = request.nextUrl.clone();

  if (url.pathname === '/getadb/new') {
    url.pathname = '/getadb/provision/new';
    return NextResponse.redirect(url, 307);
  }

  if (!GETADB_HOSTS.has(host)) return NextResponse.next();

  if (url.pathname === '/new') {
    url.pathname = '/provision/new';
    return NextResponse.redirect(url, 307);
  }

  url.pathname = url.pathname === '/' ? '/getadb' : `/getadb${url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ['/((?!_next|api).*)'],
};
