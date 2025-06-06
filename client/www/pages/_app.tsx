import '../styles/globals.css';
import '../styles/docs/tailwind.css';

import type { AppProps } from 'next/app';
import Script from 'next/script';
import Head from 'next/head';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { DocsPage } from '@/components/DocsPage';
import { Button } from '@/components/ui';
import { isDev } from '@/lib/config';
import { Dev } from '@/components/Dev';
import patchFirefoxClicks from '@/lib/patchFirefoxClicks';
import { useEffect } from 'react';

declare global {
  function __getAppId(): any;
}

(globalThis as any)._nodevtool = true;

// hack to pass app ID to examples pages
globalThis.__getAppId = () =>
  typeof window !== 'undefined'
    ? (new URL(location.href).searchParams.get('__appId') ??
      localStorage.getItem('examples-appId'))
    : undefined;

function App({ Component, pageProps }: AppProps) {
  const isDocsPage = 'markdoc' in pageProps;
  const mainEl = isDocsPage ? (
    <DocsPage {...{ Component, pageProps }} />
  ) : (
    <Component {...pageProps} />
  );
  useEffect(() => {
    return patchFirefoxClicks();
  }, []);
  return (
    <>
      <AppHead />
      <ErrorBoundary renderError={() => <Oops />}>{mainEl}</ErrorBoundary>
      {isDev ? null : <GoogleScripts />}
      {isDev ? <Dev /> : null}
    </>
  );
}

function FavIconMeta() {
  return (
    <>
      <link
        rel="apple-touch-icon-precomposed"
        sizes="57x57"
        href="/img/icon/apple-touch-icon-57x57.png"
      />
      <link
        rel="apple-touch-icon-precomposed"
        sizes="114x114"
        href="/img/icon/apple-touch-icon-114x114.png"
      />
      <link
        rel="apple-touch-icon-precomposed"
        sizes="72x72"
        href="/img/icon/apple-touch-icon-72x72.png"
      />
      <link
        rel="apple-touch-icon-precomposed"
        sizes="144x144"
        href="/img/icon/apple-touch-icon-144x144.png"
      />
      <link
        rel="apple-touch-icon-precomposed"
        sizes="60x60"
        href="/img/icon/apple-touch-icon-60x60.png"
      />
      <link
        rel="apple-touch-icon-precomposed"
        sizes="120x120"
        href="/img/icon/apple-touch-icon-120x120.png"
      />
      <link
        rel="apple-touch-icon-precomposed"
        sizes="76x76"
        href="/img/icon/apple-touch-icon-76x76.png"
      />
      <link
        rel="apple-touch-icon-precomposed"
        sizes="152x152"
        href="/img/icon/apple-touch-icon-152x152.png"
      />
      <link
        rel="icon"
        type="image/png"
        href="/img/icon/favicon-196x196.png"
        sizes="196x196"
      />
      <link
        rel="icon"
        type="image/png"
        href="/img/icon/favicon-96x96.png"
        sizes="96x96"
      />
      <link
        rel="icon"
        type="image/png"
        href="/img/icon/favicon-32x32.png"
        sizes="32x32"
      />
      <link
        rel="icon"
        type="image/png"
        href="/img/icon/favicon-16x16.png"
        sizes="16x16"
      />
      <link
        rel="icon"
        type="image/png"
        href="/img/icon/favicon-128.png"
        sizes="128x128"
      />
      <meta name="application-name" content="Instant" />
      <meta name="msapplication-TileColor" content="#FFFFFF" />
      <meta name="msapplication-TileImage" content="mstile-144x144.png" />
      <meta name="msapplication-square70x70logo" content="mstile-70x70.png" />
      <meta
        name="msapplication-square150x150logo"
        content="mstile-150x150.png"
      />
      <meta name="msapplication-wide310x150logo" content="mstile-310x150.png" />
      <meta
        name="msapplication-square310x310logo"
        content="mstile-310x310.png"
      />
    </>
  );
}

function AppHead() {
  return (
    <Head>
      <FavIconMeta />
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, maximum-scale=1"
      />
      <meta name="theme-color" content="#ffffff" />
      <meta key="og:type" property="og:type" content="website" />
      <meta
        key="og:image"
        property="og:image"
        content="https://www.instantdb.com/img/og_preview.png"
      />
    </Head>
  );
}

function GoogleScripts() {
  return (
    <>
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=G-45H27NT87Z"
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {
          /* js */ `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());

          gtag('config', 'G-45H27NT87Z');
        `
        }
      </Script>
    </>
  );
}

function Oops() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8">
      <div className="text-4xl">🙈</div>
      <p className="text-2xl font-bold text-gray-600">Oops!</p>
      <p>An unexpected error occurred. We're on it!</p>
      <Button type="link" href="/dash">
        Back to the dash
      </Button>
    </div>
  );
}

export default App;
