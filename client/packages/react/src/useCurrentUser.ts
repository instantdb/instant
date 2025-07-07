import { useContext } from 'react';
import type { User } from '@instantdb/core';
import { InstantAuthContext } from './InstantReactAbstractDatabase.ts';

/**
 * Hook that returns the current authenticated user from InstantAuthContext.
 * This hook guarantees that the user is authenticated and non-null.
 *
 * @throws {Error} If used outside of an InstantAuthContext.Provider with a valid user
 * @returns {User} The authenticated user object
 *
 * @example
 * ```tsx
 * import { InstantAuthContext, useCurrentUser } from '@instantdb/react';
 *
 * function App() {
 *   const db = init({ appId: 'your-app-id' });
 *   const { user } = db.useAuth();
 *
 *   return (
 *     <InstantAuthContext.Provider value={user}>
 *       <MyComponent />
 *     </InstantAuthContext.Provider>
 *   );
 * }
 *
 * function MyComponent() {
 *   const user = useCurrentUser(); // Never null when user is authenticated
 *   return <div>Hello {user.email}</div>;
 * }
 * ```
 */
export function useCurrentUser(): User {
  const user = useContext(InstantAuthContext);

  if (user === null || user === undefined) {
    throw new Error(
      'useCurrentUser must be used within an InstantAuthContext.Provider with an authenticated user. ' +
        'Make sure you have wrapped your component with InstantAuthContext.Provider and passed a valid user.',
    );
  }

  return user as User;
}
