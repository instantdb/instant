import type { NextApiRequest, NextApiResponse } from 'next';
import { id, init, InstantError } from '@instantdb/admin';

export const config = {
  api: { bodyParser: false },
};

const apiURI =
  process.env.NEXT_PUBLIC_INSTANT_API_URI || 'http://localhost:8888';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  try {
    const appId = req.query.appId;
    if (typeof appId !== 'string') {
      return res
        .status(400)
        .json({ ok: false, error: 'Missing appId query param' });
    }
    const db = init({ appId, apiURI });
    const guestDb = db.asUser({ guest: true });
    const { typedHandlers, combineHandlers } = db.webhooks.helpers();
    const handlers = combineHandlers(
      typedHandlers('$default', async (record) => {
        await guestDb.transact(
          db.tx.webhookEvents[id()].update({
            receivedAt: Date.now(),
            etype: record.etype,
            action: record.action,
            payload: record,
          }),
        );
      }),
    );
    await db.webhooks.processNodeRequest(handlers, req);
    const { webhookConfig } = await guestDb.query({
      webhookConfig: { $: { limit: 1 } },
    });
    const status = webhookConfig?.[0]?.nextStatusCode ?? 200;
    return res.status(status).json({ ok: status === 200, status });
  } catch (err) {
    if (err instanceof InstantError) {
      console.warn('[webhooks-pages] rejected', err.message, err.hint);
      return res
        .status(400)
        .json({ ok: false, error: err.message, details: err.hint });
    }
    throw err;
  }
}
