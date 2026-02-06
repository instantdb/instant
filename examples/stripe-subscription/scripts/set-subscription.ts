/**
 * Manually set a user's subscription status for testing.
 *
 * Usage:
 *   pnpm tsx scripts/set-subscription.ts <email> <status>
 *
 * Examples:
 *   pnpm tsx scripts/set-subscription.ts test@example.com active
 *   pnpm tsx scripts/set-subscription.ts test@example.com canceling
 *   pnpm tsx scripts/set-subscription.ts test@example.com canceled
 *   pnpm tsx scripts/set-subscription.ts test@example.com none
 */

import { init } from "@instantdb/admin";
import schema from "../src/instant.schema";

const adminDb = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN!,
  schema,
});

async function main() {
  const [email, status] = process.argv.slice(2);

  if (!email || !status) {
    console.log("Usage: pnpm tsx scripts/set-subscription.ts <email> <status>");
    console.log("Status options: active, canceling, canceled, none");
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

  // "canceling" = active but scheduled to cancel
  if (status === "canceling") {
    const cancelAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days from now
    await adminDb.transact(
      adminDb.tx.$users[user.id].update({
        subscriptionStatus: "active",
        cancelAt,
      })
    );
    console.log(`Updated ${email}: canceling (ends ${new Date(cancelAt * 1000).toLocaleDateString()})`);
    return;
  }

  const newStatus = status === "none" ? null : status;

  await adminDb.transact(
    adminDb.tx.$users[user.id].update({
      subscriptionStatus: newStatus,
      cancelAt: null,
    })
  );

  console.log(`Updated ${email}: subscriptionStatus = ${newStatus ?? "(cleared)"}`);
}

main().catch(console.error);
