import { init } from '@instantdb/react';
import schema from './instant.schema';
import config from '@/lib/config';

const clientDB = init({
  appId: process.env.NEXT_PUBLIC_FEEDBACK_APP_ID!,
  schema,
  ...config,
});

export default clientDB;
