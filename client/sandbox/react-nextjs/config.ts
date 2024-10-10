const isBrowser = typeof window !== "undefined";

const isProd = isBrowser ? Boolean(localStorage.getItem("prodBackend")) : false;

const appIdOverride = isBrowser
  ? (new URLSearchParams(window.location.search).get("app_id") ?? null)
  : null;

const config = {
  apiURI: isProd ? "https://api.instantdb.com" : "http://localhost:8888",
  websocketURI: isProd
    ? "wss://api.instantdb.com/runtime/session"
    : "ws://localhost:8888/runtime/session",

  appId: appIdOverride ?? process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  devtool: true,
};

export default config;
