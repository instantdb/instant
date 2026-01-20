import schema from '@/lib/intern/docs-feedback/instant.schema';
import { doTry } from '@/lib/parsePermsJSON';
import { anthropic } from '@ai-sdk/anthropic';
import { init, id as instantGenId } from '@instantdb/admin';
import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  tool,
  UIMessage,
} from 'ai';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import docsNavigation from '@/data/docsNavigation';

const DOCS_DIR = path.join(process.cwd(), 'public', 'docs');

const RATE_LIMIT_MINUTES = 30;
/**
 * Note: a simple question that reads index.md uses ≈4000 tokens
 */
const MAX_TOKENS_IN_PERIOD = 20_000;
const FEEDBACK_API_URL =
  process.env.NEXT_PUBLIC_FEEDBACK_API_URI || 'https://api.instantdb.com';

function getDocFiles(): string[] {
  const docFiles: string[] = [];
  for (const section of docsNavigation) {
    for (const link of section.links) {
      // Convert href like "/docs/auth/google-oauth" to "auth/google-oauth.md"
      const docPath = link.href.replace(/^\/docs\/?/, '');
      const fileName = docPath === '' ? 'index.md' : `${docPath}.md`;
      docFiles.push(fileName);
    }
  }
  return docFiles.sort();
}

const DOC_FILES = getDocFiles();

const getAdminFeedbackDb = () => {
  if (!process.env.FEEDBACK_ADMIN_TOKEN) {
    throw new Error('FEEDBACK_ADMIN_TOKEN is not set');
  }
  const adminFeedbackDb = init({
    appId:
      process.env.NEXT_PUBLIC_FEEDBACK_APP_ID ||
      '5d9c6277-e6ac-42d6-8e51-2354b4870c05',
    schema,
    adminToken: process.env.FEEDBACK_ADMIN_TOKEN,
    apiURI: FEEDBACK_API_URL,
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
        createdAt: new Date(),
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

  const response = await fetch(FEEDBACK_API_URL + '/dash/me', {
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

  const rateLimitPromise = adminDb
    .query({
      llmUsage: {
        $: {
          where: {
            usedAt: {
              $gt: new Date(Date.now() - 60 * 1000 * RATE_LIMIT_MINUTES),
            },
            userId: userIsValid.userId,
          },
        },
      },
    })
    .then((results) => {
      return results.llmUsage.reduce((acc, usage) => acc + usage.tokens, 0);
    });

  const [history, rateLimitUsage] = await Promise.all([
    historyPromise,
    rateLimitPromise,
  ]);

  if (rateLimitUsage > MAX_TOKENS_IN_PERIOD) {
    return new Response('Rate limit exceeded', { status: 429 });
  }

  const oldMessages = (history?.chats?.[0]?.messages ||
    []) as any as UIMessage[];

  const messages = [...oldMessages, message] as any as DocsUIMessage[];
  const stream = createUIMessageStream<DocsUIMessage>({
    execute: async ({ writer }) => {
      const readDocTool = tool({
        providerOptions: {
          anthropic: {
            cacheControl: { type: 'ephemeral' },
          },
        },
        description: `Read InstantDB documentation. Available docs: ${DOC_FILES.join(', ')}`,
        inputSchema: z.object({
          docName: z
            .string()
            .refine((val) => DOC_FILES.includes(val), {
              message:
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
        messages: (await convertToModelMessages(messages)).map((message) => ({
          ...message,
          providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } },
          },
        })),
        system:
          'You are a helpful assistant for InstantDB documentation. You can read multiple docs if needed to fully answer the question. Do not say anything when you go to look at information, only speak when giving the final answer. Do not read the same doc more than once. ',
        tools: {
          readDoc: readDocTool,
        },
        stopWhen: stepCountIs(5),
      });

      // no await: ensure stream runs to completion
      result.consumeStream();

      result.totalUsage.then((usage) => {
        if (!usage.totalTokens) return;
        adminDb.transact(
          adminDb.tx.llmUsage[instantGenId()].create({
            tokens: usage.totalTokens,
            usedAt: new Date(),
            userId: userIsValid.userId,
          }),
        );
      });

      writer.merge(result.toUIMessageStream());
    },
    onFinish: ({ messages, isAborted }) => {
      if (isAborted) {
        return;
      }
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
    consumeSseStream: consumeStream,
  });
}
