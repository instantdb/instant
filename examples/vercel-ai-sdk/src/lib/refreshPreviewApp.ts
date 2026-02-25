import { adminDb } from '@/lib/adminDb';
import { PlatformApi } from '@instantdb/platform';
import schema from '@/instant.schema';
import { id as createId } from '@instantdb/core';

const platformApi = new PlatformApi({});

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Checks if the previewApp for a chat is missing or expiring soon,
 * and provisions a new one if needed.
 *
 * Returns the appId of the (possibly new) preview app, or null if chat not found.
 */
export async function refreshPreviewAppIfNeeded(chatId: string) {
  const data = await adminDb.query({
    chats: {
      $: { where: { id: chatId } },
      previewApp: {},
    },
  });

  const chat = data.chats?.[0];
  if (!chat) {
    return null;
  }

  const existingApp = chat.previewApp;
  const now = Date.now();

  if (
    existingApp &&
    new Date(existingApp.expiresAt).getTime() - now >= ONE_DAY_MS
  ) {
    return existingApp.appId;
  }

  const response = await platformApi.createTemporaryApp({
    title: `preview-${chatId.slice(0, 8)}`,
    schema,
  });

  const previewAppId = existingApp?.id || createId();
  await adminDb.transact([
    adminDb.tx.previewApps[previewAppId].update({
      appId: response.app.id,
      expiresAt: new Date(response.expiresMs).toISOString(),
    }),
    adminDb.tx.chats[chatId].link({ previewApp: previewAppId }),
  ]);

  return response.app.id;
}
