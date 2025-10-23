'use client';
import { init } from '@instantdb/react/nextjs';
import schema from './instant.schema';

export const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  // cookieEndpoint: 'https://my-awesome-site.com/api/instant',
  schema,
  useDateObjects: true,
});
