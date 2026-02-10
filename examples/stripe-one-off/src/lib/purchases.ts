import { adminDb } from "./adminDb";
import { id } from "@instantdb/admin";

interface CreatePurchaseParams {
  token: string;
  email: string;
  stripeSessionId: string;
  stripePaymentIntentId: string;
  amount: number;
  currency: string;
}

export async function createPurchase(params: CreatePurchaseParams) {
  const { wallpapers } = await adminDb.query({ wallpapers: {} });
  const wallpaperIds = wallpapers.map((w) => w.id);

  const purchaseId = id();

  await adminDb.transact(
    adminDb.tx.purchases[purchaseId]
      .update({
        token: params.token,
        email: params.email,
        stripeSessionId: params.stripeSessionId,
        stripePaymentIntentId: params.stripePaymentIntentId,
        amount: params.amount,
        currency: params.currency,
        status: "completed",
        createdAt: Date.now(),
      })
      .link({ wallpapers: wallpaperIds })
  );

  return params.token;
}

export async function findPurchaseBySessionId(sessionId: string) {
  const { purchases } = await adminDb.query({
    purchases: {
      $: { where: { stripeSessionId: sessionId } },
    },
  });
  return purchases[0] || null;
}
