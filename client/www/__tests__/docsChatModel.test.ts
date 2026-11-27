import { expect, test, vi } from 'vitest';

vi.mock('@/data/docsNavigation', () => ({ default: [] }));
vi.mock('@/lib/intern/docs-feedback/instant.schema', () => ({ default: {} }));
vi.mock('@/lib/parsePermsJSON', () => ({
  doTry: (f: () => unknown) => ({ status: 'ok', value: f() }),
}));
vi.mock('next/server', () => ({ after: () => {} }));
vi.mock('@instantdb/admin', () => {
  const chain: any = new Proxy(() => chain, { get: () => chain });
  return {
    id: () => 'generated-id',
    init: () => ({
      tx: chain,
      query: async () => ({ chats: [] }),
      transact: async () => {},
      streams: {
        createWriteStream: () =>
          Object.assign(new WritableStream(), {
            streamId: async () => 'stream-id',
          }),
      },
    }),
  };
});

function anthropicReply() {
  const usage = { input_tokens: 1, output_tokens: 1 };
  const events = [
    {
      type: 'message_start',
      message: { id: 'msg', model: 'm', role: 'assistant', usage },
    },
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'hello' },
    },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage },
    { type: 'message_stop' },
  ];
  return new Response(
    events
      .map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
      .join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}

test('docs chat default model and output limit', async () => {
  vi.stubEnv('ANTHROPIC_DOCS_CHAT_MODEL', '');
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
  vi.stubEnv('FEEDBACK_ADMIN_TOKEN', 'test-token');
  let body: any;
  vi.stubGlobal('fetch', async (url: unknown, init?: RequestInit) => {
    if (String(url).endsWith('/dash/me')) {
      return Response.json({ user: { id: 'u', email: 'u@example.com' } });
    }
    body = JSON.parse(init!.body as string);
    return anthropicReply();
  });

  const { POST } = await import('../app/api/chat/route');
  const res = await POST(
    new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify({
        id: 'chat',
        localId: 'local',
        message: {
          id: 'm1',
          role: 'user',
          parts: [{ type: 'text', text: 'hi' }],
        },
      }),
    }),
  );
  await res.text();

  expect(body.model).toBe('claude-sonnet-5-5');
  expect(body.max_tokens).toBe(64000);
});
