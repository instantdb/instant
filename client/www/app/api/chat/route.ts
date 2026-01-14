import schema from '@/lib/intern/docs-feedback/instant.schema';
import { doTry } from '@/lib/parsePermsJSON';
import { anthropic } from '@ai-sdk/anthropic';
import { init, id as instantGenId, TransactionChunk } from '@instantdb/admin';
import {
  convertToModelMessages,
  streamText,
  tool,
  stepCountIs,
  UIMessage,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from 'ai';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

const DOC_FILES = [
  'auth.md',
  'backend.md',
  'cli.md',
  'common-mistakes.md',
  'create-instant-app.md',
  'devtool.md',
  'emails.md',
  'explorer-component.md',
  'http-api.md',
  'index.md',
  'init.md',
  'instaml.md',
  'instaql.md',
  'modeling-data.md',
  'next-ssr.md',
  'patterns.md',
  'permissions.md',
  'platform-api.md',
  'presence-and-topics.md',
  'start-rn.md',
  'start-vanilla.md',
  'storage.md',
  'teams.md',
  'users.md',
  'using-llms.md',
  'workflow.md',
  'auth/apple.md',
  'auth/clerk.md',
  'auth/firebase.md',
  'auth/github-oauth.md',
  'auth/google-oauth.md',
  'auth/guest-auth.md',
  'auth/linkedin-oauth.md',
  'auth/magic-codes.md',
  'auth/platform-oauth.md',
] as const;

const DOCS_DIR = path.join(process.cwd(), 'public', 'docs');

const getAdminFeedbackDb = () => {
  if (!process.env.NEXT_PUBLIC_FEEDBACK_API_URI) {
    throw new Error('NEXT_PUBLIC_FEEDBACK_API_URI is not set');
  }
  if (!process.env.FEEDBACK_ADMIN_TOKEN) {
    throw new Error('FEEDBACK_ADMIN_TOKEN is not set');
  }
  const adminFeedbackDb = init({
    appId:
      process.env.NEXT_PUBLIC_FEEDBACK_APP_ID ||
      '5d9c6277-e6ac-42d6-8e51-2354b4870c05',
    schema,
    adminToken: process.env.FEEDBACK_ADMIN_TOKEN,
    apiURI:
      process.env.NEXT_PUBLIC_FEEDBACK_API_URI || 'https://api.instantdb.com',
  });
  return adminFeedbackDb;
};

const saveChat = async ({
  db,
  messages,
  oldMessages,
  id,
  localId,
  userId,
}: {
  db: ReturnType<typeof getAdminFeedbackDb>;
  messages: UIMessage[];
  oldMessages: UIMessage[];
  id: string;
  localId: string;
  userId: string;
}) => {
  // ensure chat exists
  await db
    .transact(
      db.tx.chats[id].update({
        createdByUserId: userId,
        localId: localId,
      }),
    )
    .catch((err) => {
      throw new Error(`Failed to update chat`, { cause: err });
    });

  const txs = messages.map((m, idx) => {
    if (oldMessages.find((old) => old.id === m.id)) {
      return db.tx.messages[m.id]
        .update({
          index: idx,
          metadata: m.metadata,
          parts: m.parts,
          role: m.role,
        })
        .link({
          chat: id,
        });
    }

    return db.tx.messages[m.id]
      .update({
        index: idx,
        metadata: m.metadata,
        parts: m.parts,
        role: m.role,
        createdAt: new Date(),
      })
      .link({
        chat: id,
      });
  });

  await db.transact(txs).catch((err) => {
    throw new Error(`Failed to save chat`, { cause: err });
  });
};

export type DocsUIMessage = UIMessage<
  never,
  {
    source: {
      file: string;
    };
  }
>;

const DashRouteResponseSchema = z.object({
  user: z.object({
    id: z.string(),
  }),
});

const validateUser = async (
  req: Request,
): Promise<{ userId: string } | null> => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return null;
  }

  const apiUrl =
    process.env.NEXT_PUBLIC_FEEDBACK_API_URI || 'https://api.instantdb.com';

  const response = await fetch(apiUrl + '/dash', {
    headers: {
      Authorization: authHeader,
    },
  });
  if (!response.ok) {
    const error = await response.text();
    console.error('Failed to validate user:', error);
    return null;
  }
  const data = await response.json();
  const { user } = DashRouteResponseSchema.parse(data);
  if (user) {
    return { userId: user.id };
  }
  return null;
};

export async function POST(req: Request) {
  const userIsValid = await validateUser(req);
  if (!userIsValid) {
    return new Response('Unauthorized', { status: 401 });
  }

  const userId = userIsValid.userId;

  const adminResult = doTry(getAdminFeedbackDb);
  if (adminResult.status === 'error') {
    throw adminResult.error;
  }

  const adminDb = adminResult.value;

  const {
    message,
    id,
    localId,
  }: { message: DocsUIMessage; id: string; localId: string } = await req.json();

  const historyPromise = adminDb
    .query({
      chats: {
        $: {
          where: {
            id,
            localId,
          },
        },
        messages: {
          $: {
            order: {
              index: 'asc',
            },
          },
        },
      },
    })
    .catch((e) => {
      throw new Error('Failed to fetch chat history', { cause: e });
    });

  const rateListQuery = {
    messages: {
      $: {
        where: {
          'chat.createdAt': {
            $gt: new Date(Date.now() - 60 * 1000 * 10), // 10 minutes
          },
          'chat.createdByUserId': userId,
          role: 'user',
        },
      },
    },
  };
  console.log('Rate limit query:', JSON.stringify(rateListQuery));

  const rateLimitPromise = adminDb.query(rateListQuery);

  const [history, rateLimitMessages] = await Promise.all([
    historyPromise,
    rateLimitPromise,
  ]);

  console.info('Rate limit messages:', rateLimitMessages);

  if (rateLimitMessages.messages.length > 5) {
    throw new Error('Rate limit exceeded');
  }

  const oldMessages = (history?.chats?.[0]?.messages ||
    []) as any as UIMessage[];

  const messages = [...oldMessages, message] as any as DocsUIMessage[];
  const stream = createUIMessageStream<DocsUIMessage>({
    execute: async ({ writer }) => {
      const readDocTool = tool({
        description: `Read InstantDB documentation. Available docs: ${DOC_FILES.join(', ')}`,
        inputSchema: z.object({
          docName: z
            .enum(DOC_FILES, {
              invalid_type_error:
                'Invalid document name. Please provide a valid document name from the list.',
            })
            .describe(
              'The doc filename, e.g. "auth.md" or "auth/google-oauth.md"',
            ),
        }),
        execute: async ({ docName }) => {
          writer.write({
            type: 'data-source',
            data: {
              file: docName,
            },
            id: instantGenId(),
            transient: false,
          });
          const content = await fs.readFile(
            path.join(DOCS_DIR, docName),
            'utf-8',
          );
          return { content };
        },
      });
      const result = streamText({
        model: anthropic(
          process.env.ANTHROPIC_DOCS_CHAT_MODEL || 'claude-sonnet-4-5',
        ),
        messages: await convertToModelMessages(messages),
        system:
          'You are a helpful assistant for InstantDB documentation. Always use the readDoc tool to look up relevant documentation before answering questions. You can read multiple docs if needed to fully answer the question. Do not say anything when you go to look at information, only speak when giving the final answer. ',
        tools: {
          readDoc: readDocTool,
        },
        stopWhen: stepCountIs(5),
      });

      // no await: ensure stream runs to completion
      result.consumeStream();

      writer.merge(result.toUIMessageStream());
    },
    onFinish: ({ messages }) => {
      saveChat({
        db: adminDb,
        messages,
        id,
        localId,
        userId,
        oldMessages,
      }).catch((err) => {
        console.error(`Failed to save chat`, err);
      });
    },
    generateId: instantGenId,
    originalMessages: messages,
  });

  return createUIMessageStreamResponse({
    stream,
  });
}
