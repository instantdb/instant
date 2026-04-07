import { NextRequest, NextResponse } from 'next/server';

export type DeploymentConfigResponse = {
  apiURI: string;
  websocketURI: string;
  deploymentType: 'self-hosted' | 'cloud';
};

/**
 * Derives the WebSocket URL from an API URL.
 * https://example.com -> wss://example.com/runtime/session
 * http://example.com -> ws://example.com/runtime/session
 */
function deriveWebsocketURI(apiURI: string): string {
  const url = new URL(apiURI);
  const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${url.host}/runtime/session`;
}

/**
 * Returns deployment configuration at runtime.
 * This endpoint is used by self-hosted deployments to configure the backend URL
 * via environment variables rather than build-time constants.
 *
 * Environment variables:
 * - INSTANT_BACKEND_URL: The URL of the InstantDB backend (required for self-hosted)
 */
export const GET = async (req: NextRequest): Promise<NextResponse> => {
  const backendUrl = process.env.INSTANT_BACKEND_URL;

  if (!backendUrl) {
    return NextResponse.json(
      {
        error: 'INSTANT_BACKEND_URL environment variable is not set',
      },
      { status: 500 },
    );
  }

  // Validate the URL
  try {
    new URL(backendUrl);
  } catch {
    return NextResponse.json(
      {
        error: `INSTANT_BACKEND_URL is not a valid URL: ${backendUrl}`,
      },
      { status: 500 },
    );
  }

  const config: DeploymentConfigResponse = {
    apiURI: backendUrl,
    websocketURI: deriveWebsocketURI(backendUrl),
    deploymentType: 'self-hosted',
  };

  return NextResponse.json(config);
};
