// Runtime deployment configuration for self-hosted InstantDB dashboards.
//
// This module provides the core config logic that can be used in both
// client and server contexts. For React hooks, see useDeploymentConfig.tsx.

export type DeploymentConfig = {
  apiURI: string;
  websocketURI: string;
  deploymentType: 'self-hosted' | 'cloud';
};

// ---------------------------------------------------------------------------
// Global config state (for non-React code)
// ---------------------------------------------------------------------------

let _globalConfig: DeploymentConfig | null = null;

/**
 * Sets the global config. Called by DeploymentConfigProvider after fetching.
 */
export function setGlobalConfig(config: DeploymentConfig) {
  _globalConfig = config;
}

/**
 * Gets the current deployment config.
 * Throws if config hasn't been initialized yet (provider hasn't loaded).
 * Use this in non-React code like auth.ts, fetch utilities, etc.
 */
export function getConfig(): DeploymentConfig {
  if (!_globalConfig) {
    throw new Error(
      'Deployment config not initialized. Ensure DeploymentConfigProvider has loaded.',
    );
  }
  return _globalConfig;
}

/**
 * Checks if config has been initialized.
 * Useful for code that needs to handle the uninitialized case gracefully.
 */
export function isConfigInitialized(): boolean {
  return _globalConfig !== null;
}

// ---------------------------------------------------------------------------
// Build-time config (for cloud deployments)
// ---------------------------------------------------------------------------

const isBrowser = typeof window !== 'undefined';

function getLocalStorageItem(key: string): any {
  if (!isBrowser) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const isStaging = process.env.NEXT_PUBLIC_STAGING === 'true';
const isSelfHosted = process.env.NEXT_PUBLIC_SELF_HOSTED === 'true';

export function getCloudConfig(): DeploymentConfig {
  const devBackend = getLocalStorageItem('devBackend');
  let localPort = process.env.NEXT_PUBLIC_LOCAL_SERVER_PORT || '8888';

  // Allow port override via URL param in dev mode
  if (devBackend && isBrowser) {
    const portOverride = new URL(location.href).searchParams.get('port');
    if (portOverride) {
      localPort = portOverride;
    }
  }

  return {
    apiURI: devBackend
      ? `http://localhost:${localPort}`
      : `https://${isStaging ? 'api-staging' : 'api'}.instantdb.com`,
    websocketURI: devBackend
      ? `ws://localhost:${localPort}/runtime/session`
      : `wss://${isStaging ? 'api-staging' : 'api'}.instantdb.com/runtime/session`,
    deploymentType: 'cloud',
  };
}

// Initialize global config immediately for cloud deployments
if (!isSelfHosted) {
  _globalConfig = getCloudConfig();
}

export { isSelfHosted };
