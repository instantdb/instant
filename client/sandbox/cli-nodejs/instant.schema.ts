import "dotenv/config";

import { i } from "@instantdb/core";

const graph = i.graph(
  process.env.INSTANT_APP_ID!,
  {
    patients: i.entity({
      name: i.string(),
      therapistId: i.string(),
    }),
    sessions: i.entity({
      date: i.string(),
    }),
  },
  {
    patientSessions: {
      forward: {
        on: "patients",
        has: "many",
        label: "sessions",
      },
      reverse: {
        on: "sessions",
        has: "one",
        label: "patient",
      },
    },
  },
);

export default graph;
