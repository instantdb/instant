import { User } from '@instantdb/core';
import { cookies } from 'next/headers.js';

/**
 * @deprecated Please use `getUnvalidatedUserFromInstantCookie` instead
 * @returns
 */
export const getUserFromInstantCookie = async (
  appId: string,
): Promise<User | null> => {
  const cookieStore = await cookies();
  const userJSON = cookieStore.get('instant_user_' + appId);
  const user = userJSON ? JSON.parse(decodeURIComponent(userJSON.value)) : null;
  return user;
};

export const getUnvalidatedUserFromInstantCookie = async (
  appId: string,
): Promise<User | null> => {
  const cookieStore = await cookies();
  const userJSON = cookieStore.get('instant_user_' + appId);
  const user = userJSON ? JSON.parse(decodeURIComponent(userJSON.value)) : null;
  return user;
};
