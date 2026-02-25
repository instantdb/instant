import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const host = request.headers.get('host') || '';

  // Redirect /preview/[chatId] to [chatId].[host]/preview/[chatId] for
  // subdomain isolation, but only on hosts that support wildcard subdomains.
  // localhost and vercel.app don't support them.
  const supportsWildcard =
    !host.includes('localhost') && !host.includes('vercel.app');

  if (supportsWildcard && url.pathname.startsWith('/preview/')) {
    const parts = url.pathname.split('/');
    const chatId = parts[2];

    if (chatId && !host.startsWith(`${chatId}.`)) {
      const newUrl = url.clone();
      // Strip any existing subdomain prefix (e.g. www.) so we get
      // chatId.example.com instead of chatId.www.example.com
      const hostParts = newUrl.host.split('.');
      const baseDomain =
        hostParts.length > 2 ? hostParts.slice(-2).join('.') : newUrl.host;
      newUrl.host = `${chatId}.${baseDomain}`;
      return NextResponse.redirect(newUrl.toString());
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/preview/:path*'],
};
