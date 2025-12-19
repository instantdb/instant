import { User } from '@instantdb/core';
import { cookies } from 'next/headers.js';

export const getUserFromInstantCookie = async (
  appId: string,
): Promise<User | null> => {
  const cookieStore = await cookies();
  const userJSON = cookieStore.get('instant_user_' + appId);
  const user = userJSON ? JSON.parse(userJSON.value) : null;
  return user;
};
