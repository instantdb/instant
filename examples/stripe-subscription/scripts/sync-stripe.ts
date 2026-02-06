/**
 * Sync subscription data from Stripe to InstantDB.
 *
 * Usage:
 *   pnpm tsx scripts/sync-stripe.ts [email]
 *
 * If email is provided, syncs only that user. Otherwise syncs all users with a Stripe customer ID.
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

async function syncUser(user: { id: string; email?: string | null; stripeCustomerId?: string | null }) {
  if (!user.stripeCustomerId) {
    console.log(`${user.email}: No Stripe customer ID, skipping`);
    return;
  }

  // Get subscriptions for this customer
  const subscriptions = await stripe.subscriptions.list({
    customer: user.stripeCustomerId,
    limit: 1,
  });

  const subscription = subscriptions.data[0] as Stripe.Subscription & {
    cancel_at: number | null;
  } | undefined;

  if (!subscription) {
    console.log(`${user.email}: No subscription found`);
    await adminDb.transact(
      adminDb.tx.$users[user.id].update({
        subscriptionStatus: null,
        cancelAt: null,
      })
    );
    return;
  }

  await adminDb.transact(
    adminDb.tx.$users[user.id].update({
      subscriptionStatus: subscription.status,
      cancelAt: subscription.cancel_at,
    })
  );

  const status = subscription.cancel_at
    ? `${subscription.status} (canceling ${new Date(subscription.cancel_at * 1000).toLocaleDateString()})`
    : subscription.status;

  console.log(`${user.email}: ${status}`);
}

async function main() {
  const [emailFilter] = process.argv.slice(2);

  const { $users } = await adminDb.query({ $users: {} });

  const usersToSync = emailFilter
    ? $users.filter((u) => u.email === emailFilter)
    : $users.filter((u) => u.stripeCustomerId);

  if (usersToSync.length === 0) {
    console.log(emailFilter ? `User not found: ${emailFilter}` : "No users with Stripe customer IDs");
    return;
  }

  console.log(`Syncing ${usersToSync.length} user(s)...\n`);

  for (const user of usersToSync) {
    await syncUser(user);
  }

  console.log("\nDone!");
}

main().catch(console.error);
