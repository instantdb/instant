// We need to know:
// where the backend is
// if we are in self-hosted mode

import React, { useEffect } from 'react';
import { useState } from 'react';
import { getLocal } from '../config';

export type DeploymentConfig = {
  apiURI: string;
  websocketURI: string;
  deploymentType: 'self-hosted' | 'cloud';
};

const DeploymentConfigContext = React.createContext<
  DeploymentConfig | undefined
>(undefined);

export function useDeploymentConfig() {
  const config = React.useContext(DeploymentConfigContext);
  if (!config) {
    throw new Error(
      'useDeploymentConfig must be used within a DeploymentConfigProvider',
    );
  }
  return config;
}

export function useIsCloud() {
  const config = useDeploymentConfig();
  return config.deploymentType === 'cloud';
}

const getIsSelfHosted = () => process.env.NEXT_PUBLIC_SELF_HOSTED == 'true';
const getDevBackend = () => getLocal('devBackend');
const devBackend = getDevBackend();

let localPort = process.env.NEXT_PUBLIC_LOCAL_SERVER_PORT || '8888';
const isStaging = process.env.NEXT_PUBLIC_STAGING === 'true';

const defaultCloudConfig: DeploymentConfig = {
  apiURI: devBackend
    ? `http://localhost:${localPort}`
    : `https://${isStaging ? 'api-staging' : 'api'}.instantdb.com`,
  websocketURI: devBackend
    ? `ws://localhost:${localPort}/runtime/session`
    : `wss://${isStaging ? 'api-staging' : 'api'}.instantdb.com/runtime/session`,
  deploymentType: 'cloud',
};

export function DeploymentConfigProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const isSelfHosted = process.env.NEXT_PUBLIC_SELF_HOSTED == 'true';
  const [config, setConfig] = useState<DeploymentConfig | null>(
    isSelfHosted ? null : defaultCloudConfig,
  );

  // Defined at build-time
  const devBackend = getLocal('devBackend');

  // TODO: add loading state
  if (!config) {
    return null;
  }

  useEffect(() => {
    if (!config) {
      // fetch from server
    }
  }, []);

  return (
    <DeploymentConfigContext.Provider value={config}>
      {children}
    </DeploymentConfigContext.Provider>
  );
}
