import '../styles/globals.css';
import '../styles/docs/tailwind.css';

import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Providers } from './providers';

const isDev = process.env.NODE_ENV === 'development';

export const metadata: Metadata = {
  applicationName: 'Instant',
  openGraph: {
    type: 'website',
    images: ['https://www.instantdb.com/img/og_preview.png'],
  },
  icons: {
    icon: [
      { url: '/img/icon/favicon-196x196.png', sizes: '196x196', type: 'image/png' },
      { url: '/img/icon/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/img/icon/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/img/icon/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/img/icon/favicon-128.png', sizes: '128x128', type: 'image/png' },
    ],
    apple: [
      { url: '/img/icon/apple-touch-icon-57x57.png', sizes: '57x57' },
      { url: '/img/icon/apple-touch-icon-114x114.png', sizes: '114x114' },
      { url: '/img/icon/apple-touch-icon-72x72.png', sizes: '72x72' },
      { url: '/img/icon/apple-touch-icon-144x144.png', sizes: '144x144' },
      { url: '/img/icon/apple-touch-icon-60x60.png', sizes: '60x60' },
      { url: '/img/icon/apple-touch-icon-120x120.png', sizes: '120x120' },
      { url: '/img/icon/apple-touch-icon-76x76.png', sizes: '76x76' },
      { url: '/img/icon/apple-touch-icon-152x152.png', sizes: '152x152' },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#ffffff',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href="/fonts/Switzer-Regular.woff"
          as="font"
          type="font/woff"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/Switzer-Medium.woff"
          as="font"
          type="font/woff"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/Switzer-Semibold.woff"
          as="font"
          type="font/woff"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="https://stopaio.s3.amazonaws.com/public/BerkeleyMono-Regular.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
        {!isDev && <GoogleScripts />}
      </body>
    </html>
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
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-45H27NT87Z');
        `}
      </Script>
    </>
  );
}
