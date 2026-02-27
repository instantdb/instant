import type { Metadata } from 'next';
import { IBM_Plex_Mono, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { AuthGate } from '@/components/AuthGate';
import { Toaster } from 'sonner';
import { InstantProvider } from '@/components/InstantProvider';
import { getUnverifiedUserFromInstantCookie } from '@instantdb/react/nextjs';

const headingFont = Space_Grotesk({
  variable: '--font-heading',
  subsets: ['latin'],
});

const monoFont = IBM_Plex_Mono({
  variable: '--font-code',
  weight: ['400', '500', '600'],
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Vercel AI SDK App Builder',
  description:
    'Browser app builder powered by OpenAI Codex via Vercel AI SDK and Instant Platform API',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getUnverifiedUserFromInstantCookie(
    process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  );

  return (
    <html lang="en">
      <body
        className={`${headingFont.variable} ${monoFont.variable} antialiased`}
      >
        <Toaster position="top-right" />
        <InstantProvider user={user}>
          <AuthGate>{children}</AuthGate>
        </InstantProvider>
      </body>
    </html>
  );
}
