import schema from '@/lib/intern/docs-feedback/instant.schema';
import { doTry } from '@/lib/parsePermsJSON';
import { anthropic } from '@ai-sdk/anthropic';
import { init, id as instantGenId } from '@instantdb/admin';
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

const saveChat = async (
  db: ReturnType<typeof getAdminFeedbackDb>,
  messages: UIMessage[],
  id: string,
) => {
  console.log('Saving chat:', messages, id);

  // ensure chat exists
  await db.transact(db.tx.chats[id].update({}));

  const txs = messages.map((m, idx) => {
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

export async function POST(req: Request) {
  const adminResult = doTry(getAdminFeedbackDb);
  if (adminResult.status === 'error') {
    throw adminResult.error;
  }
  const adminDb = adminResult.value;
  const { message, id }: { message: DocsUIMessage; id: string } =
    await req.json();
  const history = await adminDb
    .query({
      chats: {
        $: {
          where: {
            id,
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

  console.log('History:', history);
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
      saveChat(adminDb, messages, id);
    },
    generateId: instantGenId,
    originalMessages: messages,
  });

  return createUIMessageStreamResponse({
    stream,
  });
}
