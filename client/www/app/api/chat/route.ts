import docsNavigation from '@/data/docsNavigation';
import { after } from 'next/server';
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

export const maxDuration = 60;

const DOCS_DIR = path.join(process.cwd(), 'public', 'docs');
const MAX_MESSAGES_PER_CHAT = 20;
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
    email: z.string(),
  }),
});

const validateUser = async (
  req: Request,
): Promise<{ userId: string; userEmail: string } | null> => {
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
    return { userId: user.id, userEmail: user.email };
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

  const history = await adminDb
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

  const oldMessages = (history?.chats?.[0]?.messages ||
    []) as any as UIMessage[];

  if (oldMessages.length >= MAX_MESSAGES_PER_CHAT) {
    return new Response(JSON.stringify({ error: 'chat_limit_exceeded' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const messages = [...oldMessages, message] as any as DocsUIMessage[];
  const stream = createUIMessageStream<DocsUIMessage>({
    execute: async ({ writer }) => {
      const MAX_DOC_READS = 4;
      let docReadsCount = 0;

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
          if (docReadsCount >= MAX_DOC_READS) {
            return {
              error:
                'Maximum document reads reached. Please answer with the information you have.',
            };
          }
          docReadsCount++;

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
        messages: (await convertToModelMessages(messages)).map(
          (message, i) => ({
            ...message,
            providerOptions:
              i == messages.length - 1
                ? {
                    anthropic: { cacheControl: { type: 'ephemeral' } },
                  }
                : undefined,
          }),
        ),
        system: {
          content: `You are a helpful assistant for InstantDB documentation. Your role is to answer questions about how InstantDB works based on the documentation.

You can read multiple docs if needed to fully answer the question. Do not say anything when you go to look at information, only speak when giving the final answer. Do not read the same doc more than once.

IMPORTANT: You are a Q&A assistant, not a coding assistant. If someone asks you to build them an app, write code for a feature, or help with step-by-step implementation beyond what's covered in the docs, politely redirect them with this guidance:

"For building apps with Instant, I'd recommend:
1. Run \`npx create-instant-app\` to scaffold a new project
2. Use an AI coding agent like Claude Code to help you build from there - it can read the Instant docs and help you implement features step by step.

I'm here to answer questions about how Instant works - feel free to ask about specific concepts, APIs, or features!"

Do not generate application code, write components, or provide implementation details beyond explaining how Instant's APIs work.`,
          role: 'system',
          providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } },
          },
        },
        tools: {
          readDoc: readDocTool,
        },
        stopWhen: stepCountIs(6),
        onError: (error) => {
          console.error('Error in streamText:', error);
        },
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
            userEmail: userIsValid.userEmail,
          }),
        );
      });

      writer.merge(result.toUIMessageStream());
    },
    onFinish: ({ messages, isAborted }) => {
      if (isAborted) {
        return;
      }
      return saveChat({
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
