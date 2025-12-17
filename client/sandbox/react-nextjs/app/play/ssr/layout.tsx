import { cookies } from 'next/headers';
import { appId } from './db';
import { InstantSuspenseProvider } from '@instantdb/react/nextjs';
import schema from './instant.schema';

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
      <InstantSuspenseProvider
        config={{
          appId: appId!,
          firstPartyPath: '/api/instant',
          apiURI: 'http://localhost:8888',
          websocketURI: 'ws://localhost:8888/runtime/session',
          schema: JSON.stringify(schema),
          useDateObjects: true,
        }}
        user={user}
      >
        {children}
      </InstantSuspenseProvider>
    </div>
  );
}
