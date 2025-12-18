'use client';

import { Explorer, Toaster } from '@instantdb/components';
import { useEphemeralApp } from '../../hooks/useEphemeralApp';

function Main({ appId, adminToken }: { appId: string; adminToken: string }) {
  return (
    <div className="min-h-screen">
      <Explorer appId={appId} adminToken={adminToken} useShadowDOM={true} />
      <Toaster />
    </div>
  );
}

function App() {
  const { appId, adminToken, error, isLoading } = useEphemeralApp({
    storageKey: 'explorer-ephemeral-app',
  });

  if (error) {
    return <div>There was an error {error.message}</div>;
  }

  if (isLoading) {
    return <div className="mx-auto flex max-w-lg flex-col">Loading...</div>;
  }

  return <Main appId={appId!} adminToken={adminToken!} />;
}

export default App;
