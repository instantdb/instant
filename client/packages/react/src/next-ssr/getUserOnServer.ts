import { cookies } from 'next/headers.js';

export const getUserOnServer = async (appId: string) => {
  const cookieStore = await cookies();
  const userJSON = cookieStore.get('instant_user_' + appId);
  const user = userJSON ? JSON.parse(userJSON.value) : null;
  return user;
};
