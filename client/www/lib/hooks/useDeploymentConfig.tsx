// React hooks and components for deployment configuration.
// For the core config logic, see ../deploymentConfig.ts

import React, { useEffect, useState } from 'react';
import {
  type DeploymentConfig,
  getConfig,
  isConfigInitialized,
  setGlobalConfig,
  getCloudConfig,
  isSelfHosted,
} from '../deploymentConfig';

// Re-export for convenience
export { getConfig, isConfigInitialized, type DeploymentConfig };

let _configPromise: Promise<DeploymentConfig> | null = null;

// ---------------------------------------------------------------------------
// React Context
// ---------------------------------------------------------------------------

const DeploymentConfigContext = React.createContext<
  DeploymentConfig | undefined
>(undefined);

/**
 * React hook to access deployment config.
 * Must be used within a DeploymentConfigProvider.
 */
export function useDeploymentConfig(): DeploymentConfig {
  const config = React.useContext(DeploymentConfigContext);
  if (!config) {
    throw new Error(
      'useDeploymentConfig must be used within a DeploymentConfigProvider',
    );
  }
  return config;
}

/**
 * Hook to check if running in cloud mode.
 */
export function useIsCloud(): boolean {
  const config = useDeploymentConfig();
  return config.deploymentType === 'cloud';
}

/**
 * Hook to check if running in self-hosted mode.
 */
export function useIsSelfHosted(): boolean {
  const config = useDeploymentConfig();
  return config.deploymentType === 'self-hosted';
}

// ---------------------------------------------------------------------------
// Provider Component
// ---------------------------------------------------------------------------

async function fetchDeploymentConfig(): Promise<DeploymentConfig> {
  const response = await fetch('/api/deployment');
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch deployment config');
  }
  return response.json();
}

export function DeploymentConfigProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // For cloud deployments, use build-time config immediately
  const [config, setConfig] = useState<DeploymentConfig | null>(
    isSelfHosted ? null : getCloudConfig(),
  );
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (isSelfHosted && !config) {
      // Reuse existing promise if already fetching (e.g., in Strict Mode)
      if (!_configPromise) {
        _configPromise = fetchDeploymentConfig();
      }

      _configPromise
        .then((fetchedConfig) => {
          setGlobalConfig(fetchedConfig);
          setConfig(fetchedConfig);
        })
        .catch((err) => {
          console.error('Failed to load deployment config:', err);
          setError(err);
        });
    } else if (!isSelfHosted && config) {
      // Ensure global config is set for cloud deployments
      setGlobalConfig(config);
    }
  }, [config]);

  // For self-hosted: show nothing until config loads
  if (isSelfHosted && !config) {
    if (error) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>
          <h1>Configuration Error</h1>
          <p>{error.message}</p>
          <p>
            Please ensure the <code>INSTANT_BACKEND_URL</code> environment
            variable is set correctly.
          </p>
        </div>
      );
    }
    return null;
  }

  return (
    <DeploymentConfigContext.Provider value={config!}>
      {children}
    </DeploymentConfigContext.Provider>
  );
}
