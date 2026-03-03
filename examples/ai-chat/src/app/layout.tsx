import type { Metadata } from 'next';
import './globals.css';
import { InstantProvider } from '@/components/InstantProvider';
import { AuthGate } from '@/components/AuthGate';
import { getUnverifiedUserFromInstantCookie } from '@instantdb/react/nextjs';

export const metadata: Metadata = {
  title: 'AI Chat with Instant Streams',
  description:
    'Resumable AI chat using InstantDB Streams and the Vercel AI SDK',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUnverifiedUserFromInstantCookie(
    process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  );

  return (
    <html lang="en">
      <body>
        <InstantProvider user={user}>
          <AuthGate>{children}</AuthGate>
        </InstantProvider>
      </body>
    </html>
  );
}
