import { UI_MESSAGE_STREAM_HEADERS } from 'ai';
import { createResumableStreamContext } from '@instantdb/resumable-stream';
import { after } from 'next/server';
import { getFilePubSub } from '../../../../../lib/file-pubsub';

function getStreamContext({
  appId,
  adminToken,
  apiURI,
}: {
  appId: string;
  adminToken: string;
  apiURI: string;
}) {
  return createResumableStreamContext({
    waitUntil: after,
    appId,
    adminToken,
    apiURI,
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { subscriber } = getFilePubSub();

  // Get the active stream ID for this chat
  const activeStreamId = await subscriber.get(
    `instant-chat-stream:${id}:activeStreamId`,
  );

  if (!activeStreamId) {
    return new Response(null, { status: 204 });
  }

  const configStr = await subscriber.get(`instant-chat-stream:${id}:config`);

  if (!configStr) {
    return new Response(null, { status: 204 });
  }

  const config = JSON.parse(String(configStr));

  // Get the number of characters to skip (content already received by client)
  const url = new URL(req.url);
  const skipChars = parseInt(url.searchParams.get('skipChars') || '0', 10);

  const streamContext = getStreamContext(config);
  const stream = await streamContext.resumeExistingStream(
    String(activeStreamId),
    skipChars,
  );

  if (!stream) {
    // Stream completed, clear the active stream ID
    const { publisher } = getFilePubSub();
    await publisher.set(`instant-chat-stream:${id}:activeStreamId`, '');
    return new Response(null, { status: 204 });
  }

  return new Response(stream, { headers: UI_MESSAGE_STREAM_HEADERS });
}
