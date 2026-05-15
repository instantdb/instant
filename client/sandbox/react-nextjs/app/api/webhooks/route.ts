import { id, init, InstantError } from '@instantdb/admin';

const apiURI =
  process.env.NEXT_PUBLIC_INSTANT_API_URI || 'http://localhost:8888';

export const POST = async (req: Request) => {
  try {
    const url = new URL(req.url);
    const appId = url.searchParams.get('appId');
    if (!appId) {
      return Response.json(
        { ok: false, error: 'Missing appId query param' },
        { status: 400 },
      );
    }
    const db = init({ appId, apiURI });
    const guestDb = db.asUser({ guest: true });
    const { typedHandlers, combineHandlers } = db.webhooks.helpers();

    const handlers = combineHandlers(
      typedHandlers('$default', async (record) => {
        try {
          console.log('RECORD', record);
          console.log(
            await guestDb.transact(
              db.tx.webhookEvents[id()].update({
                receivedAt: Date.now(),
                namespace: record.namespace,
                action: record.action,
                payload: record,
              }),
            ),
          );
        } catch (e) {
          console.log('ERROR!', e);
          throw e;
        }
      }),
    );
    await db.webhooks.processRequest(handlers, req);
    const { webhookConfig } = await guestDb.query({
      webhookConfig: { $: { limit: 1 } },
    });
    const status = webhookConfig?.[0]?.nextStatusCode ?? 200;
    return Response.json({ ok: status === 200, status }, { status });
  } catch (err) {
    if (err instanceof InstantError) {
      console.warn('[webhooks] rejected', err.message, err.hint);
      return Response.json(
        { ok: false, error: err.message, details: err.hint },
        { status: 400 },
      );
    }
    throw err;
  }
};
