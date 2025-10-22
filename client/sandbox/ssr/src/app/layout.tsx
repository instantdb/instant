import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { InstantSuspenseProvider } from '@instantdb/next';
import { Suspense } from 'react';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Create Instant App',
  description: 'Instant DB Starter App',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <InstantSuspenseProvider
          apiURI="http://localhost:8888"
          token={'9c43fa56-b032-4c7f-a757-3a83b98fe04f'}
          appId={process.env.NEXT_PUBLIC_INSTANT_APP_ID!}
        >
          {children}
        </InstantSuspenseProvider>
      </body>
    </html>
  );
}
