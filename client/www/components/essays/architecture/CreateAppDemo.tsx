import { useEffect, useState } from 'react';
import { Button, Copyable } from '@/components/ui';
import config from '@/lib/config';
import { type DemoState } from './Demos';
import { createDemoApp } from './createDemoApp';

function formatExpiry(expiresMs: number): string {
  const days = Math.ceil((expiresMs - Date.now()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Expired';
  if (days === 1) return 'Expires in 1 day';
  return `Expires in ${days} days`;
}

export default function CreateAppDemo({
  demoState,
  setDemoState,
}: {
  demoState: DemoState;
  setDemoState: (state: DemoState) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const app = demoState.app;

  useEffect(() => {
    if (!app) {
      // Warm the CORS preflight cache for the POST we'll make later
      fetch(`${config.apiURI}/dash/apps/ephemeral`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {});
    }
  }, [app]);

  return (
    <div className="essay-breakout not-prose my-4 flex h-48 flex-col rounded-md border border-gray-200 bg-gray-50 p-4">
      {app ? (
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center space-y-3">
          <div className="space-y-2">
            <Copyable
              label={<span className="inline-block w-24">App ID</span>}
              value={app.id}
            />
            <Copyable
              label={<span className="inline-block w-24">Admin Token</span>}
              value={app.adminToken}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-400">
              {formatExpiry(app.expiresMs)}
            </div>
            <button
              className="cursor-pointer text-xs text-gray-400 hover:text-gray-600"
              onClick={() => setDemoState({ app: null })}
            >
              Reset
            </button>
          </div>
        </div>
      ) : (
        <div className="flex h-full flex-1 flex-col items-center justify-center">
          <Button
            variant="cta"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              setError(null);
              try {
                const app = await createDemoApp();
                setDemoState({ app });
              } catch (e: any) {
                setError(e?.message || 'Failed to create app');
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? 'Creating...' : 'Create an app'}
          </Button>
          {error ? (
            <div className="mt-2 text-sm text-red-600">{error}</div>
          ) : null}
        </div>
      )}
    </div>
  );
}
