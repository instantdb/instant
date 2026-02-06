/**
 * Cancel a user's Stripe subscription immediately.
 *
 * Usage:
 *   npx tsx scripts/cancel-subscription.ts <email>
 */

import { init } from "@instantdb/admin";
import Stripe from "stripe";
import schema from "../src/instant.schema";

const adminDb = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN!,
  schema,
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

async function main() {
  const [email] = process.argv.slice(2);

  if (!email) {
    console.log("Usage: npx tsx scripts/cancel-subscription.ts <email>");
    process.exit(1);
  }

  // Find user
  const { $users } = await adminDb.query({
    $users: { $: { where: { email } } },
  });

  const user = $users[0];
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  if (!user.stripeCustomerId) {
    console.error(`No Stripe customer ID for: ${email}`);
    process.exit(1);
  }

  // Get active subscriptions
  const subscriptions = await stripe.subscriptions.list({
    customer: user.stripeCustomerId,
    status: "active",
  });

  if (subscriptions.data.length === 0) {
    console.log(`No active subscriptions for: ${email}`);
    process.exit(0);
  }

  // Cancel all active subscriptions
  for (const sub of subscriptions.data) {
    await stripe.subscriptions.cancel(sub.id);
    console.log(`Canceled subscription: ${sub.id}`);
  }

  // Sync local data
  await adminDb.transact(
    adminDb.tx.$users[user.id].update({
      subscriptionStatus: "canceled",
      cancelAt: null,
    })
  );

  console.log(`\nDone! ${email} has been canceled.`);
}

main().catch(console.error);
