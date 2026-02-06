// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from "@instantdb/react";

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
      imageURL: i.string().optional(),
      type: i.string().optional(),
    }),
    wallpapers: i.entity({
      name: i.string(),
      description: i.string().optional(),
      thumbnailUrl: i.string(),
      fullResUrl: i.string(),
      order: i.number().indexed(),
    }),
    purchases: i.entity({
      token: i.string().unique().indexed(),
      email: i.string().indexed(),
      stripeSessionId: i.string().unique().indexed(),
      stripePaymentIntentId: i.string().optional(),
      amount: i.number(),
      currency: i.string(),
      status: i.string().indexed(),
      createdAt: i.number().indexed(),
    }),
  },
  links: {
    $usersLinkedPrimaryUser: {
      forward: {
        on: "$users",
        has: "one",
        label: "linkedPrimaryUser",
        onDelete: "cascade",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "linkedGuestUsers",
      },
    },
    wallpaperFile: {
      forward: { on: "wallpapers", has: "one", label: "file" },
      reverse: { on: "$files", has: "one", label: "wallpaper" },
    },
    purchaseWallpapers: {
      forward: { on: "purchases", has: "many", label: "wallpapers" },
      reverse: { on: "wallpapers", has: "many", label: "purchases" },
    },
  },
  rooms: {},
});

// This helps TypeScript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
