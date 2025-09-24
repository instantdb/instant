const isProd =
  typeof window !== 'undefined'
    ? Boolean(localStorage.getItem('prodBackend'))
    : false;

const config = {
  apiURI: isProd ? 'https://api.instantdb.com' : 'http://localhost:8888',
  websocketURI: isProd
    ? 'wss://api.instantdb.com/runtime/session'
    : 'ws://localhost:8888/runtime/session',

  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  devtool: true,
};

export default config;
