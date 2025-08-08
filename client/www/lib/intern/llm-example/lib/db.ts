import { init } from '@instantdb/react';
import schema from '../instant.schema';

const APP_ID = process.env.NEXT_PUBLIC_LLM_EXAMPLE_APP_ID!;
const db = init({ appId: APP_ID, schema });

export default db;
