import { UI_MESSAGE_STREAM_HEADERS } from 'ai';
import { init, i } from '@instantdb/admin';
import { getFilePubSub } from '../../../../../lib/file-pubsub';

const schema = i.schema({ entities: {} });

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  console.log('HELLO WORLD');
  const { id } = await params;
  const { subscriber } = getFilePubSub();

  const activeStreamId = await subscriber.get(
    `instant-chat:${id}:activeStreamId`,
  );

  if (!activeStreamId) {
    return new Response(null, { status: 204 });
  }

  console.log('INSTANT1 req.url ', req.url);

  const configStr = await subscriber.get(`instant-chat:${id}:config`);

  if (!configStr) {
    return new Response(null, { status: 204 });
  }

  const { appId, adminToken, apiURI } = JSON.parse(String(configStr));

  const db = init({ appId, adminToken, apiURI, schema, verbose: false });

  const stream = db.streams.createReadStream({
    clientId: activeStreamId as string,
  });

  return new Response(stream, { headers: UI_MESSAGE_STREAM_HEADERS });
}
