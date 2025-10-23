import { cookies } from 'next/headers';
import { db } from './db';
import { InstantSuspenseProvider } from '@instantdb/react/nextjs';

// (server page)
export default async function ({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('instant_refresh_token');

  if (!process.env.NEXT_PUBLIC_INSTANT_APP_ID) {
    return <div>No app id found</div>;
  }

  return (
    <div>
      <InstantSuspenseProvider db={db} token={token?.value}>
        {children}
      </InstantSuspenseProvider>
    </div>
  );
}
