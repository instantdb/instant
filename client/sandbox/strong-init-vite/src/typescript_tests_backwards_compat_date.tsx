import { init, BackwardsCompatibleSchema } from "@instantdb/react";

type Message = {
  content: string;
  createdAt: Date;
};

type User = {
  email: string;
};

type Schema = {
  messages: Message;
  creator: User;
};

type EmojiName = "fire" | "wave" | "confetti" | "heart";

type Rooms = {
  chat: {
    presence: {
      name: string;
      avatarURI: string;
    };
    topics: {
      emoji: {
        name: EmojiName;
        rotationAngle: number;
        directionAngle: number;
      };
    };
  };
};

// ----
// Core

const db = init<BackwardsCompatibleSchema<Schema, Rooms>>({
  appId: import.meta.env.VITE_INSTANT_APP_ID,
});

const res = db.useQuery({ messages: { creator: {} }})
const m = res.data?.messages[0];
// Hover over `m` to see that `m?.createdAt` and see that it says `Date`;
m?.createdAt;



