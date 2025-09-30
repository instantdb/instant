import { init } from '@instantdb/react';
import schema from './instant.schema';
import config from '@/lib/config';

const clientDB = init({
  appId:
    process.env.NEXT_PUBLIC_FEEDBACK_APP_ID ||
    '5d9c6277-e6ac-42d6-8e51-2354b4870c05',
  schema,
  ...config,
});

export default clientDB;
