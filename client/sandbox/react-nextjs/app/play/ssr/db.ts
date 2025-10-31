'use client';
import { init } from '@instantdb/react';
import schema from './instant.schema';
import { createUseSuspenseQuery } from '@instantdb/react/nextjs';

export const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  endpointURI: 'https://my-awesome-site.com/api/instant',
  schema,
  useDateObjects: true,
});

export const useSuspenseQuery = createUseSuspenseQuery(db);
