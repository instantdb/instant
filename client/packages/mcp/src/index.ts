#!/usr/bin/env node

import 'dotenv/config';
import express, { Request, Response, Express, query, response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { PlatformApi } from '@instantdb/platform';
import { zodToSchema } from './schema.ts';
import { parseArgs } from 'node:util';
import version from './version.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { pinoHttp } from 'pino-http';
import { pino } from 'pino';
import { init } from '@instantdb/admin';

import schema from './db/instant.schema.ts';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { PlatformApiAuth } from '../../platform/dist/esm/api.js';
import {
  addOAuthRoutes,
  makeApiAuth,
  OAuthConfig,
  ServiceProvider,
  tokensOfBearerToken,
} from './oauth-service-provider.ts';
import { KeyConfig } from './crypto.ts';
import indexHtml from './index.html.ts';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

// Helpers
// -----------
function createPlatformApi(
  auth: PlatformApiAuth,
  apiURI?: string,
): PlatformApi {
  return new PlatformApi({
    auth,
    apiURI,
  });
}

function createMCPServer(): McpServer {
  return new McpServer({
    name: '@instantdb/mcp',
    version,
  });
}

function handleError(error: unknown): {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
} {
  return {
    content: [
      {
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      },
    ],
    isError: true,
  };
}

// Zod Schemas
// -----------
const schemaAdditions = z.object({
  entities: z
    .record(
      z.string(),
      z.record(
        z.string(),
        z.object({
          type: z.enum(['string', 'number', 'boolean', 'date', 'json']),
          required: z.boolean().optional().default(true),
          unique: z.boolean().optional().default(false),
          indexed: z.boolean().optional().default(false),
        }),
      ),
    )
    .optional()
    .describe('Entities and their attributes to add'),
  links: z
    .record(
      z.string(),
      z.object({
        from: z.object({
          entity: z.string(),
          has: z.enum(['one', 'many']),
          label: z.string(),
          required: z.boolean().optional(),
          onDelete: z.literal('cascade').optional(),
        }),
        to: z.object({
          entity: z.string(),
          has: z.enum(['one', 'many']),
          label: z.string(),
          required: z.boolean().optional(),
          onDelete: z.literal('cascade').optional(),
        }),
      }),
    )
    .optional()
    .describe('Links to add between entities'),
});

const appPerms = z
  .object({
    $default: z
      .object({
        bind: z.array(z.string()).optional().describe('Variables to bind'),
        allow: z.object({
          $default: z.string().nullable().optional(),
          view: z.string().nullable().optional(),
          create: z.string().nullable().optional(),
          update: z.string().nullable().optional(),
          delete: z.string().nullable().optional(),
        }),
      })
      .optional()
      .describe('Default rules for all entities'),
    attrs: z
      .object({
        bind: z.array(z.string()).optional().describe('Variables to bind'),
        allow: z.object({
          $default: z.string().nullable().optional(),
          view: z.string().nullable().optional(),
          create: z.string().nullable().optional(),
          update: z.string().nullable().optional(),
          delete: z.string().nullable().optional(),
        }),
      })
      .optional()
      .describe('Rules for all attributes'),
  })
  .catchall(
    z.object({
      bind: z.array(z.string()).optional().describe('Variables to bind'),
      allow: z.object({
        $default: z.string().nullable().optional(),
        view: z.string().nullable().optional(),
        create: z.string().nullable().optional(),
        update: z.string().nullable().optional(),
        delete: z.string().nullable().optional(),
      }),
    }),
  )
  .describe('Permission rules for the app');

// Tool Registration
// -----------
function registerTools(server: McpServer, api: PlatformApi) {
  server.tool(
    'create-app',
    'Create a new Instant app. Optionally provide schema and permissions to preconfigure it',
    {
      name: z.string().describe('Name of the app'),
      title: z
        .string()
        .describe(
          'Title of the app. If not provided, come up with a default title based on the context of the app',
        ),
      schema: schemaAdditions
        .optional()
        .describe('Initial schema additions to apply'),
      perms: appPerms.optional().describe('Initial permission rules to apply'),
    },
    async ({ title, schema, perms }) => {
      try {
        const result = await api.createApp({
          title,
          schema: schema ? zodToSchema(schema) : ({} as unknown as any),
          perms: perms || {},
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.tool(
    'get-apps',
    'List all apps owned by the authenticated user',
    {
      includeSchema: z
        .boolean()
        .optional()
        .describe('Include schema in response'),
      includePerms: z
        .boolean()
        .optional()
        .describe('Include permissions in response'),
    },
    async ({ includeSchema, includePerms }) => {
      try {
        const opts = { includeSchema, includePerms };
        const result = await api.getApps(opts);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.tool(
    'get-app',
    'Fetch a single app by its ID',
    {
      appId: z.string().uuid().describe('UUID of the app'),
      includeSchema: z
        .boolean()
        .optional()
        .describe('Include schema in response'),
      includePerms: z
        .boolean()
        .optional()
        .describe('Include permissions in response'),
    },
    async ({ appId, includeSchema, includePerms }) => {
      try {
        const opts = { includeSchema, includePerms };
        const result = await api.getApp(appId, opts);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.tool(
    'get-schema',
    'Fetch schema for an app by its ID',
    {
      appId: z.string().uuid().describe('UUID of the app'),
    },
    async ({ appId }) => {
      try {
        const { schema } = await api.getSchema(appId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(schema, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.tool(
    'get-perms',
    'Fetch permissions for an app by its ID',
    {
      appId: z.string().uuid().describe('UUID of the app'),
    },
    async ({ appId }) => {
      try {
        const { perms } = await api.getPerms(appId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(perms, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.tool(
    'plan-schema-push',
    'Dry-run a schema push and receive a plan of steps the server would execute',
    {
      appId: z.string().uuid().describe('UUID of the app'),
      additions: schemaAdditions.describe(
        'New Instant schema additions to apply to an app',
      ),
    },
    async ({ appId, additions }) => {
      try {
        const schema = zodToSchema(additions);
        const result = await api.planSchemaPush(appId, {
          schema: schema as unknown as any,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.tool(
    'push-schema',
    "Execute a schema push. Use this after 'plan-schema-push' to apply changes",
    {
      appId: z.string().uuid().describe('UUID of the app'),
      additions: schemaAdditions.describe(
        'New Instant schema additions to apply',
      ),
    },
    async ({ appId, additions }) => {
      try {
        const schema = zodToSchema(additions);
        const result = await api.schemaPush(appId, {
          schema: schema as unknown as any,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.tool(
    'push-perms',
    'Execute a permissions push.',
    {
      appId: z.string().uuid().describe('UUID of the app'),
      perms: appPerms.describe(
        'Instant permission rules to apply. You should first fetch the current rules using `get-perms` and modify them as needed',
      ),
    },
    async ({ appId, perms }) => {
      try {
        const result = await api.pushPerms(appId, { perms });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );
}

async function startStdio() {
  const {
    values: { token, ['api-url']: apiUrl },
  } = parseArgs({
    options: {
      token: {
        type: 'string',
      },
      ['api-url']: {
        type: 'string',
      },
    },
  });

  const accessToken = token || process.env.INSTANT_ACCESS_TOKEN;
  if (!accessToken) {
    console.error(
      'Provide an access token using --token or set INSTANT_ACCESS_TOKEN environment variable',
    );
    process.exit(1);
  }

  const api = createPlatformApi({ token: accessToken }, apiUrl);
  const server = createMCPServer();
  registerTools(server, api);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Instant Platform MCP Server running on stdio');
}

function ensureEnv(key: string): string {
  const v = process.env[key];
  if (!v) {
    throw new Error(`Missing environment variable ${key}`);
  }
  return v;
}

async function startSse() {
  const db = init({
    adminToken: ensureEnv('INSTANT_ADMIN_TOKEN'),
    appId: ensureEnv('INSTANT_APP_ID'),
    schema,
  });

  const oauthConfig: OAuthConfig = {
    clientId: ensureEnv('INSTANT_OAUTH_CLIENT_ID'),
    clientSecret: ensureEnv('INSTANT_OAUTH_CLIENT_SECRET'),
    serverOrigin: ensureEnv('SERVER_ORIGIN'),
  };

  const keyConfig: KeyConfig = JSON.parse(ensureEnv('INSTANT_AES_KEY'));

  const app = express();
  const logger = pino({ level: 'info' });
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore(req) {
          return req.url === '/health';
        },
      },
    }),
  );
  app.use(express.json());

  const proxyProvider = new ServiceProvider(db, oauthConfig, keyConfig);

  app.use(
    mcpAuthRouter({
      scopesSupported: ['apps-read', 'apps-write'],
      provider: proxyProvider,
      issuerUrl: new URL(oauthConfig.serverOrigin),
      baseUrl: new URL(oauthConfig.serverOrigin),
      serviceDocumentationUrl: new URL('https://instantdb.com/docs'),
    }),
  );

  addOAuthRoutes(app, db, oauthConfig);

  const requireTokenMiddleware = requireBearerAuth({
    verifier: proxyProvider,
    resourceMetadataUrl: `${oauthConfig.serverOrigin}/.well-known/oauth-protected-resource`,
  });

  // Handle POST requests for client-to-server communication
  app.post(
    '/mcp',
    requireTokenMiddleware,
    async (req: Request, res: Response) => {
      const server = createMCPServer();
      try {
        const tokens = await tokensOfBearerToken(db, req.auth!.token);

        const api = createPlatformApi(
          makeApiAuth(oauthConfig, keyConfig, db, tokens.instantToken),
        );

        registerTools(server, api);
        const transport: StreamableHTTPServerTransport =
          new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
          });

        req.on('close', () => {
          transport.close();
          server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (e) {
        console.error('Error handling MCP request:', e);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: null,
          });
        }
      }
    },
  );

  // We're a stateless server, so disallow these
  const handleSessionRequest = async (
    _req: express.Request,
    res: express.Response,
  ) => {
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Method not allowed.',
        },
        id: null,
      }),
    );
  };

  app.get('/mcp', handleSessionRequest);
  app.delete('/mcp', handleSessionRequest);

  // SSE for older clients
  const transports = {
    sse: {} as Record<string, SSEServerTransport>,
  };

  app.get(
    '/sse',
    requireTokenMiddleware,
    async (req: Request, res: Response) => {
      const server = createMCPServer();
      const transport = new SSEServerTransport('/messages', res);
      res.on('close', () => {
        delete transports.sse[transport.sessionId];
      });

      try {
        const tokens = await tokensOfBearerToken(db, req.auth!.token);

        const api = createPlatformApi(
          makeApiAuth(oauthConfig, keyConfig, db, tokens.instantToken),
        );

        registerTools(server, api);

        transports.sse[transport.sessionId] = transport;
      } catch (e) {
        console.error('Error handling MCP SSE request:', e);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: null,
          });
        }
        return;
      }

      await server.connect(transport);
    },
  );

  // Legacy message endpoint for older clients
  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports.sse[sessionId];
    if (transport) {
      await transport.handlePostMessage(req, res, req.body);
    } else {
      res.status(400).send('No transport found for sessionId');
    }
  });

  app.get('/', (_req, res: Response) => {
    res
      .status(200)
      .set('Content-Type', 'text/html; charset=UTF-8')
      .send(indexHtml(oauthConfig.serverOrigin));
  });

  app.get('/health', (_req, res: Response) => {
    res.status(200).send('Tip top!');
  });

  const port = parseInt(process.env.PORT || '3123');
  const host = process.env.IN_FLY ? '0.0.0.0' : 'localhost';

  if (process.env.IN_FLY) {
    app.set('trust proxy', 2);
  }

  app.listen(port, host, () => console.log(`listening on port ${port}`));
}

async function main() {
  if (process.env.SERVER_TYPE === 'http') {
    return startSse();
  }
  return startStdio();
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
