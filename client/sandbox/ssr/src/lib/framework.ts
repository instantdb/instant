import { init } from "@instantdb/react";

export const isServer = typeof window === "undefined" || "Deno" in globalThis;

export const createClient = (refreshToken: string) => {};

export const getTriples = async (query: any, refeshToken: string) => {
  const response = await fetch("http://localhost:8888/admin/triples", {
    method: "POST",
    headers: {
      "app-id": "5254559c-306d-4eae-a362-0af5b7b072e2",
      "Content-Type": "application/json",
      Authorization: `Bearer 9c43fa56-b032-4c7f-a757-3a83b98fe04f`,
    },
    body: JSON.stringify({
      query: query,
      "inference?": true,
    }),
  });

  const data = await response.json();
  console.log(data[0]["data"]["datalog-result"]["join-rows"]);

  return null;
};
