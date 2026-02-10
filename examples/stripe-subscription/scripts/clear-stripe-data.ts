/**
 * Clear Stripe-related data for a user (useful when switching between test/live mode).
 *
 * Usage:
 *   npx tsx scripts/clear-stripe-data.ts <email>
 */

import { init } from "@instantdb/admin";
import schema from "../src/instant.schema";

const adminDb = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN!,
  schema,
});

async function main() {
  const [email] = process.argv.slice(2);

  if (!email) {
    console.log("Usage: npx tsx scripts/clear-stripe-data.ts <email>");
    process.exit(1);
  }

  const { $users } = await adminDb.query({
    $users: { $: { where: { email } } },
  });

  const user = $users[0];
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  await adminDb.transact(
    adminDb.tx.$users[user.id].update({
      stripeCustomerId: null,
      subscriptionStatus: null,
      cancelAt: null,
    })
  );

  console.log(`Cleared Stripe data for: ${email}`);
}

main().catch(console.error);
