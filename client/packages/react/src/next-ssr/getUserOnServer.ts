import { cookies } from 'next/headers.js';

export const getUserOnServer = async () => {
  const cookieStore = await cookies();
  const userJSON = cookieStore.get('instant_user');
  const user = userJSON ? JSON.parse(userJSON.value) : null;
  return user;
};
