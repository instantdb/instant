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
  url.pathname = url.pathname === '/' ? '/getadb' : `/getadb${url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ['/((?!_next|api).*)'],
};
