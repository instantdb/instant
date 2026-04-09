import { useState } from 'react';
import { PlatformApi } from '@instantdb/platform';
import config from '@/lib/config';
import * as ephemeral from '@/lib/ephemeral';
import { type DemoState } from './Demos';

export default function CreationTimeDemo({
  demoState,
  setDemoState,
}: {
  demoState: DemoState;
  setDemoState: (state: DemoState) => void;
}) {
  const [loading, setLoading] = useState(false);

  if (demoState.app) {
    return <span className="font-semibold">{demoState.app.timeTaken}ms</span>;
  }

  return (
    <button
      className="cursor-pointer font-semibold underline decoration-dotted"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const start = Date.now();
          const res = await ephemeral.provisionApp({
            title: 'architecture-essay-app',
          });
          const appId = res.app.id;
          const adminToken = res.app['admin-token'];
          const api = new PlatformApi({
            auth: { token: adminToken },
            apiURI: config.apiURI,
          });
          await api.pushPerms(appId, {
            perms: {
              $files: {
                allow: {
                  view: 'true',
                  create: 'true',
                },
              },
            },
          });
          const timeTaken = Date.now() - start;
          setDemoState({
            app: {
              id: appId,
              adminToken,
              timeTaken,
              expiresMs: res.expires_ms,
            },
          });
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? 'Creating...' : 'Click to see'}
    </button>
  );
}
