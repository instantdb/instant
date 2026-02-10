import { init, id } from "@instantdb/admin";
import schema from "../src/instant.schema";
import { WALLPAPER_DATA } from "../src/lib/wallpapers";

const adminDb = init({
  appId: process.env.INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN!,
  schema,
});

async function seed() {
  console.log("Seeding wallpapers...");

  const { wallpapers: existingWallpapers } = await adminDb.query({
    wallpapers: {},
  });

  if (existingWallpapers.length > 0) {
    console.log(`Found ${existingWallpapers.length} existing wallpapers.`);
    console.log("Deleting existing wallpapers...");
    const deleteTxs = existingWallpapers.map((w) =>
      adminDb.tx.wallpapers[w.id].delete()
    );
    await adminDb.transact(deleteTxs);
    console.log("Deleted existing wallpapers.");
  }

  console.log(`Creating ${WALLPAPER_DATA.length} wallpapers...`);
  const createTxs = WALLPAPER_DATA.map((w) =>
    adminDb.tx.wallpapers[id()].update({
      name: w.name,
      description: w.description,
      thumbnailUrl: w.thumbnailUrl,
      fullResUrl: w.fullResUrl,
      order: w.order,
    })
  );

  await adminDb.transact(createTxs);
  console.log("Wallpapers seeded successfully!");
}

seed().catch(console.error);
