import { PlatformApi } from '@instantdb/platform';
import config from '@/lib/config';
import { type DemoState } from './Demos';

export async function createDemoApp(): Promise<NonNullable<DemoState['app']>> {
  const api = new PlatformApi({ apiURI: config.apiURI });
  const start = Date.now();
  const { app, expiresMs } = await api.createTemporaryApp({
    title: 'Architecture Essay App',
    rules: {
      code: {
        $files: {
          allow: {
            view: 'true',
            create: 'true',
          },
        },
      },
    },
  });
  const timeTaken = Date.now() - start;
  return {
    id: app.id,
    adminToken: app.adminToken,
    timeTaken,
    expiresMs,
  };
}
