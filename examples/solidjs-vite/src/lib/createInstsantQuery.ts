import { InstaQLResponse, ValidQuery } from "@instantdb/core";
import { from } from "solid-js";
import { AppSchema } from "../instant.schema";
import { db, UsingDateObjects } from "./db";

export const createInstantQuery = <Q extends ValidQuery<Q, AppSchema>>(
  q: Q,
) => {
  const signal = from<
    InstaQLResponse<AppSchema, Q, UsingDateObjects> | undefined
  >((s) => {
    const unsub = db.subscribeQuery(q, (data) => {
      if (data.data) {
        s(() => data.data);
      }
    });
    return unsub;
  });

  return signal;
};
