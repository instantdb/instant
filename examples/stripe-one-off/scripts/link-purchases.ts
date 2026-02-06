import { init } from "@instantdb/admin";
import schema from "../src/instant.schema";

const adminDb = init({
  appId: process.env.INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN!,
  schema,
});

async function linkPurchases() {
  console.log("Fetching purchases and wallpapers...");

  const { purchases, wallpapers } = await adminDb.query({
    purchases: {},
    wallpapers: {},
  });

  console.log(`Found ${purchases.length} purchases and ${wallpapers.length} wallpapers`);

  if (purchases.length === 0) {
    console.log("No purchases to link.");
    return;
  }

  if (wallpapers.length === 0) {
    console.log("No wallpapers to link to.");
    return;
  }

  const wallpaperIds = wallpapers.map((w) => w.id);

  console.log("Linking purchases to wallpapers...");

  const linkTxs = purchases.map((purchase) =>
    adminDb.tx.purchases[purchase.id].link({ wallpapers: wallpaperIds })
  );

  await adminDb.transact(linkTxs);

  console.log(`Linked ${purchases.length} purchases to ${wallpapers.length} wallpapers.`);
}

linkPurchases().catch(console.error);
