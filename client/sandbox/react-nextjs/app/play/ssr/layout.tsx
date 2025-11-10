import { cookies } from 'next/headers';
import { db } from './db';
import { InstantSuspenseProvider } from '@instantdb/react/nextjs';

// (server page)
export default async function ({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const userJSON = cookieStore.get('instant_user');
  const user = userJSON ? JSON.parse(userJSON.value) : null;

  if (!process.env.NEXT_PUBLIC_INSTANT_APP_ID) {
    return <div>No app id found</div>;
  }

  return (
    <div>
      <InstantSuspenseProvider db={db} user={user}>
        {children}
      </InstantSuspenseProvider>
    </div>
  );
}
