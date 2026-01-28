import { InstantProvider } from './InstantProvider';
import { getUnverifiedUserFromInstantCookie } from '@instantdb/react/nextjs';

// (server page)
export default async function ({ children }: { children: React.ReactNode }) {
  const user = await getUnverifiedUserFromInstantCookie(
    process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  );

  if (!process.env.NEXT_PUBLIC_INSTANT_APP_ID) {
    return <div>No app id found</div>;
  }

  return (
    <div>
      <InstantProvider user={user}>{children}</InstantProvider>
    </div>
  );
}
