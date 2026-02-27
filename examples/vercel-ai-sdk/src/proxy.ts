import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getDomain } from 'tldts';

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

    const CHAT_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

    if (chatId && !host.startsWith(`${chatId}.`)) {
      if (!CHAT_ID_RE.test(chatId)) {
        return NextResponse.next();
      }
      const newUrl = url.clone();
      // Strip any existing subdomain prefix (e.g. www.) so we get
      // chatId.example.com instead of chatId.www.example.com
      const baseDomain = getDomain(newUrl.hostname) || newUrl.host;
      newUrl.host = `${chatId}.${baseDomain}`;
      return NextResponse.redirect(newUrl.toString());
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/preview/:path*'],
};
