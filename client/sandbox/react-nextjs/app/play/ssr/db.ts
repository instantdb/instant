'use client';
import { init } from '@instantdb/react';
import schema from './instant.schema';
import { createUseSuspenseQuery } from '@instantdb/react/nextjs';
import config from '../../../config';

export const db = init({
  ...config,
  // if doing cookie sync:
  // endpointURI: "http://localhost:4000",
  schema,
  useDateObjects: true,
});

export const useSuspenseQuery = createUseSuspenseQuery(db);
