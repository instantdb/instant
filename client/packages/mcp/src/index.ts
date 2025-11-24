#!/usr/bin/env node

import 'dotenv/config';
import express, { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { parseArgs } from 'node:util';
import version from './version.ts';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { HoneycombSDK } from '@honeycombio/opentelemetry-node';
import {
  trace,
  SpanKind,
  SpanStatusCode,
  Tracer,
  Attributes,
} from '@opentelemetry/api';

import {
  createOAuthMetadata,
  mcpAuthRouter,
} from '@modelcontextprotocol/sdk/server/auth/router.js';
import { pinoHttp } from 'pino-http';
import { pino } from 'pino';
import { init } from '@instantdb/admin';

import schema from './db/instant.schema.ts';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import {
  addOAuthRoutes,
  OAuthConfig,
  ServiceProvider,
  tokensOfBearerToken,
} from './oauth-service-provider.ts';
import { KeyConfig } from './crypto.ts';
import indexHtml from './index.html.ts';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

// Helpers
// -----------
function createMCPServer(): McpServer {
  return new McpServer({
    name: '@instantdb/mcp',
    version,
  });
}

// Tool Registration
// -----------

// Adds tracing to server.tool
function wrapServerWithTracing(
  server: McpServer,
  tracer: Tracer,
  attrs: Attributes,
): McpServer {
  const originalTool = server.tool.bind(server);

  server.tool = function (name: string, ...args: any[]): any {
    // Find the callback (it's always the last argument)
    const callback = args[args.length - 1];
    const otherArgs = args.slice(0, -1);

    // Wrap the callback with tracing
    const wrappedCallback = async (...callbackArgs: any[]) => {
      const span = tracer.startSpan(`tool.${name}`, {
        attributes: attrs,
      });
      try {
        const result = await callback(...callbackArgs);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    };

    return originalTool(
      name,
      // @ts-expect-error: not sure how to type this
      ...otherArgs,
      wrappedCallback,
    );
  } as any;

  return server;
}

function registerTools(server: McpServer) {
  server.tool(
    'learn',
    "If you don't have any context provided about InstantDB, use this tool to learn about it!",
    {},
    async () => {
      const instructions = `
      You can learn about InstantDB by fetching our rules file for agents:

      https://www.instantdb.com/llm-rules/AGENTS.md
      `;

      return {
        content: [
          {
            type: 'text',
            text: instructions,
          },
        ],
      };
    },
  );

  server.tool(
    'create-app',
    "Create a new Instant app. Only do this if there isn't already an existing app setup",
    {
      title: z.string().describe('Title of the new app'),
    },
    async ({ title }) => {
      const instructions = `
      Before creating a new app make sure one doesn't already exist.

      If schema or perms already exist, they will be in \`instant.schema.ts\` and \`instant.perms.ts\`.
      If an app id and admin token already exists, they will be in \`.env\` or another env file.

      CRITICAL: If these exist you likely don't need to create a new app unless a user specifically askes you to overwrite those.

      If you do need to create a new app, you can use the instant-cli tool:

      \`\`\`bash
      npx instant-cli init-without-files --title ${title}
      \`\`\`

      This outputs an app id and admin token. Store them in an env file.

      Now you can create or overwrite \`instant.schema.ts\` and \`instant.perms.ts\` with schema and permissions for the new app.

      After creating schema and perm files push them up to the app using the instant-cli tool:

      \`\`\`
      npx instant-cli push --app <NEW_APP_ID> --token <NEW_ADMIN_TOKEN> --yes
      \`\`\`

      We supply the --yes flag to skip confirmation prompts.
      `;

      return {
        content: [
          {
            type: 'text',
            text: instructions,
          },
        ],
      };
    },
  );

  server.tool(
    'get-schema',
    'Fetch schema for an app by its ID!',
    {
      appId: z.string().uuid().describe('UUID of the app'),
      adminToken: z
        .string()
        .uuid()
        .describe('UUID of the admin token for the app'),
    },
    async ({ appId, adminToken }) => {
      const instructions = `
      You can fetch the schema for the app by using the instant-cli tool:

      \`\`\`
      npx instant-cli pull schema --app ${appId} --token ${adminToken} --yes
      \`\`\`

      We supply the --yes flag to skip confirmation prompts. Now 'instant.schema.ts' with contain the schema for the app.
      `;

      return {
        content: [
          {
            type: 'text',
            text: instructions,
          },
        ],
      };
    },
  );

  server.tool(
    'get-perms',
    'Fetch permissions for an app by its ID',
    {
      appId: z.string().uuid().describe('UUID of the app'),
      adminToken: z
        .string()
        .uuid()
        .describe('UUID of the admin token for the app'),
    },
    async ({ appId, adminToken }) => {
      const instructions = `
      You fetch the permissions for the app by using the instant-cli tool:

      \`\`\`
      npx instant-cli pull perms --app ${appId} --token ${adminToken} --yes
      \`\`\`

      We supply the --yes flag to skip confirmation prompts. Now 'instant.perms.ts' will contain the permissions for the app.
      `;

      return {
        content: [
          {
            type: 'text',
            text: instructions,
          },
        ],
      };
    },
  );

  server.tool(
    'push-schema',
    `Push local schema changes for an app to the server. Do this after updating your local 'instant.schema.ts' file.
    If you don't have an instant.schema.ts file yet, use the get-schema tool to learn how to get this file.`,
    {
      appId: z.string().uuid().describe('UUID of the app'),
      adminToken: z
        .string()
        .uuid()
        .describe('UUID of the admin token for the app'),
    },
    async ({ appId, adminToken }) => {
      const instructions = `
      Push schema changes by using the instant-cli tool:


      \`\`\`
      npx instant-cli push schema --app ${appId} --token ${adminToken} --yes
      \`\`\`

      We supply the --yes flag to skip confirmation prompts.

      By default the instant-cli tool will assume new fields from the previous schema are additions and missing fields are deletions.
      If you want to rename fields as part of your schema changes you can use the --rename flag to specify renames.

      \`\`\`
      npx instant-cli push schema --app ${appId} --token ${adminToken} --rename 'posts.author:posts.creator stores.owner:stores.manager' --yes
      \`\`\`
      `;

      return {
        content: [
          {
            type: 'text',
            text: instructions,
          },
        ],
      };
    },
  );

  server.tool(
    'push-perms',
    `Push local permissions changes for an app to the server. Do this after updating your local instant.perms.ts file.
    If you don't have an instant.perms.ts file yet, use the get-perms tool to learn how to get this file.`,
    {
      appId: z.string().uuid().describe('UUID of the app'),
      adminToken: z
        .string()
        .uuid()
        .describe('UUID of the admin token for the app'),
    },
    async ({ appId, adminToken }) => {
      const instructions = `
      Push permission changes by using the instant-cli tool:

      \`\`\`
      npx instant-cli push schema --app ${appId} --token ${adminToken} --yes
      \`\`\`

      We supply the --yes flag to skip confirmation prompts.
      `;

      return {
        content: [
          {
            type: 'text',
            text: instructions,
          },
        ],
      };
    },
  );

  server.tool(
    'query',
    'Execute a query againt an app. Useful for inspecting data in the app.',
    {},
    async () => {
      const instructions = `
      You can query data for an app by writing and executing a script using the
      Admin SDK. Here's an example script for fetching a habit and its completions:

      \`\`\`typescript
      import { init } from "@instantdb/admin";
      import "dotenv/config";

      const adminDb = init({
        appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
        adminToken: process.env.INSTANT_APP_ADMIN_TOKEN!,
      });

      async function fetchHabit(habitName: string) {
        const { habits } = await adminDb.query({
          habits: {
            $: { where: { name: habitName } },
            completions: {},
          },
        });
        console.log(habits);
      }

      fetchHabit("Read");
      \`\`\`

      If you're unsure how to write queries, refer to the documentation:

      https://instantdb.com/docs/instaql.md
      `;

      return {
        content: [
          {
            type: 'text',
            text: instructions,
          },
        ],
      };
    },
  );

  server.tool(
    'transact',
    'Execute a transaction against an app. Useful for seeding or modifying data in the app.',
    {},
    async () => {
      const instructions = `
      You can transact data for an app by writing and executing a script using the
      Admin SDK. Here's an example script for seeding a microblog app with some posts:

      \`\`\`typescript
      import { init, id } from "@instantdb/admin";
      import "dotenv/config";

      const adminDb = init({
        appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
        adminToken: process.env.INSTANT_APP_ADMIN_TOKEN!,
      });

      interface Post {
        id: number;
        author: string;
        handle: string;
        color: string;
        content: string;
        timestamp: string;
        likes: number;
        liked: boolean;
      }

      const mockPosts: Post[] = [
        {
          author: 'Sarah Chen',
          handle: 'sarahchen',
          color: 'bg-blue-100',
          content: 'Just launched my new project! Really excited to share it with everyone.',
          timestamp: '2h ago',
          likes: 12,
          liked: false,
        },
        {
          author: 'Alex Rivera',
          handle: 'alexrivera',
          color: 'bg-purple-100',
          content: 'Beautiful sunset today. Nature never stops amazing me.',
          timestamp: '4h ago',
          likes: 19,
          liked: true,
        },
        {
          author: 'Jordan Lee',
          handle: 'jordanlee',
          color: 'bg-pink-100',
          content: 'Working on something cool with Next.js and TypeScript. Updates coming soon!',
          timestamp: '6h ago',
          likes: 7,
          liked: false,
        },
      ];

      function friendlyTimeToTimestamp(friendlyTime: string) {
        const hours = parseInt(friendlyTime);
        const now = Date.now();
        return now - (hours * 60 * 60 * 1000);
      }

      function seed() {
        console.log("Seeding db...");
        mockPosts.forEach(post => {
          const userId = id();
          const postId = id();
          const user = adminDb.tx.$users[userId].create({});
          const profile = adminDb.tx.profiles[userId].create({
            displayName: post.author,
            handle: post.handle,
          }).link({ user: userId });
          const postEntity = adminDb.tx.posts[postId].create({
            color: post.color,
            content: post.content,
            timestamp: friendlyTimeToTimestamp(post.timestamp),
          }).link({ author: userId });
          const likes = Array.from({ length: post.likes }, () => adminDb.tx.likes[id()].create({ postId, userId }).link({ post: postId, user: userId }));
          adminDb.transact([user, profile, postEntity, ...likes]);
        })
      }

      seed();
      \`\`\`

      If you're unsure how to make transactions, refer to the documentation:

      https://instantdb.com/docs/instaml.md
      `;

      return {
        content: [
          {
            type: 'text',
            text: instructions,
          },
        ],
      };
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

  const server = createMCPServer();
  registerTools(server);

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
  const honeycomb = new HoneycombSDK({
    apiKey: process.env.HONEYCOMB_API_KEY,
    serviceName: 'mcp-server',
  });

  if (process.env.HONEYCOMB_API_KEY) {
    honeycomb.start();
  }

  const tracer = trace.getTracer('mcp-server');

  const db = init({
    adminToken: ensureEnv('INSTANT_ADMIN_TOKEN'),
    appId: ensureEnv('INSTANT_APP_ID'),
    schema,
    disableValidation: true,
  });

  const oauthConfig: OAuthConfig = {
    clientId: ensureEnv('INSTANT_OAUTH_CLIENT_ID'),
    clientSecret: ensureEnv('INSTANT_OAUTH_CLIENT_SECRET'),
    serverOrigin: ensureEnv('SERVER_ORIGIN'),
  };

  const keyConfig: KeyConfig = JSON.parse(ensureEnv('INSTANT_AES_KEY'));

  const app = express();
  const logger = pino({ level: 'info' });

  app.use((req, res, next) => {
    const span = tracer.startSpan('http-req', {
      kind: SpanKind.SERVER,
      attributes: {
        'http.method': req.method,
        'http.url': req.url,
        'http.target': req.path,
        'http.host': req.get('host'),
        'http.scheme': req.protocol,
      },
    });

    const originalEnd = res.end.bind(res);
    res.end = function (this: typeof res, ...args: any[]): typeof res {
      span.setAttribute('http.status_code', res.statusCode);
      span.setStatus({
        code: res.statusCode >= 400 ? SpanStatusCode.ERROR : SpanStatusCode.OK,
      });
      span.end();
      return originalEnd(...args);
    };

    next();
  });

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

  const authRouterOptions = {
    scopesSupported: ['apps-read', 'apps-write'],
    provider: proxyProvider,
    issuerUrl: new URL(oauthConfig.serverOrigin),
    baseUrl: new URL(oauthConfig.serverOrigin),
    serviceDocumentationUrl: new URL('https://instantdb.com/docs'),
  };

  const oauthMetadata = createOAuthMetadata(authRouterOptions);

  app.use(mcpAuthRouter(authRouterOptions));

  addOAuthRoutes(app, db, oauthConfig);

  app.get('/.well-known/oauth-protected-resource/mcp', (_req, res) => {
    res.json({
      resource: `${oauthConfig.serverOrigin}/mcp`,
      authorization_servers: [oauthMetadata.issuer],
      scopes_supported: oauthMetadata.scopes_supported,
      resource_documentation: 'https://instantdb.com/docs',
    });
  });

  app.get('/.well-known/oauth-protected-resource/sse', (_req, res) => {
    res.json({
      resource: `${oauthConfig.serverOrigin}/mcp`,
      authorization_servers: [oauthMetadata.issuer],
      scopes_supported: oauthMetadata.scopes_supported,
      resource_documentation: 'https://instantdb.com/docs',
    });
  });

  const requireTokenMiddleware = (path: string) =>
    requireBearerAuth({
      verifier: proxyProvider,
      resourceMetadataUrl: `${oauthConfig.serverOrigin}/.well-known/oauth-protected-resource/${path}`,
    });

  // Handle POST requests for client-to-server communication
  app.post(
    '/mcp',
    requireTokenMiddleware('mcp'),
    async (req: Request, res: Response) => {
      const server = createMCPServer();
      try {
        const tokens = await tokensOfBearerToken(db, req.auth!.token);

        wrapServerWithTracing(server, tracer, {
          'client.client_id': tokens.mcpToken.client?.client_id,
          'client.name': tokens.mcpToken.client?.client_name,
          'client.id': tokens.mcpToken.client?.id,
          'client.scope': tokens.mcpToken.client?.scope,
          'client.uri': tokens.mcpToken.client?.client_uri,
          'client.redirect_urls': tokens.mcpToken.client?.redirect_uris,
        });
        registerTools(server);
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
    requireTokenMiddleware('sse'),
    async (req: Request, res: Response) => {
      const server = createMCPServer();
      const transport = new SSEServerTransport('/messages', res);
      res.on('close', () => {
        delete transports.sse[transport.sessionId];
      });

      try {
        const tokens = await tokensOfBearerToken(db, req.auth!.token);

        wrapServerWithTracing(server, tracer, {
          'client.client_id': tokens.mcpToken.client?.client_id,
          'client.name': tokens.mcpToken.client?.client_name,
          'client.id': tokens.mcpToken.client?.id,
          'client.scope': tokens.mcpToken.client?.scope,
          'client.uri': tokens.mcpToken.client?.client_uri,
          'client.redirect_urls': tokens.mcpToken.client?.redirect_uris,
        });

        registerTools(server);
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
