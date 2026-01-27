import { User } from '@instantdb/core';
import { cookies } from 'next/headers.js';

/**
 * @deprecated Please use `getUnverifiedUserFromInstantCookie` instead
 */
export const getUserFromInstantCookie = async (
  appId: string,
): Promise<User | null> => {
  return getUnverifiedUserFromInstantCookie(appId);
};

/**
 * Parses a user object from current Next.JS request context's cookies.
 */
export const getUnverifiedUserFromInstantCookie = async (
  appId: string,
): Promise<User | null> => {
  const cookieStore = await cookies();
  const userJSON = cookieStore.get('instant_user_' + appId);
  const user = userJSON ? JSON.parse(decodeURIComponent(userJSON.value)) : null;
  return user;
};
