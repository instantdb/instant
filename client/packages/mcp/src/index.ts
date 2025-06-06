#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { PlatformApi } from '@instantdb/platform';
import { zodToSchema } from './schema.ts';
import { parseArgs } from 'node:util';

// Helpers
// -----------
function createPlatformApi(token: string, apiURI?: string): PlatformApi {
  return new PlatformApi({
    auth: { token },
    apiURI,
  });
}

function createMCPServer(): McpServer {
  return new McpServer({
    name: 'instant-mcp',
    version: '1.0.0',
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
        }),
        to: z.object({
          entity: z.string(),
          has: z.enum(['one', 'many']),
          label: z.string(),
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
    "Execute a permissions push. Use this after 'plan-perms-push' to apply changes",
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

// Main function to run the server
// -----------
async function main() {
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

  const api = createPlatformApi(accessToken, apiUrl);
  const server = createMCPServer();
  registerTools(server, api);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Instant Platform MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
