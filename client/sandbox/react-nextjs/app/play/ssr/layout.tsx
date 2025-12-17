import { cookies } from 'next/headers';
import { appId } from './db';
import schema from './instant.schema';
import { InstantProvider } from './InstantProvider';

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
      <InstantProvider user={user}>{children}</InstantProvider>
    </div>
  );
}
