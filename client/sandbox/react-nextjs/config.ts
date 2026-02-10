const isProd =
  typeof window !== 'undefined'
    ? Boolean(localStorage.getItem('prodBackend'))
    : false;

const localPort = process.env.NEXT_PUBLIC_LOCAL_SERVER_PORT || '8888';

const config = {
  apiURI: isProd ? 'https://api.instantdb.com' : `http://localhost:${localPort}`,
  websocketURI: isProd
    ? 'wss://api.instantdb.com/runtime/session'
    : `ws://localhost:${localPort}/runtime/session`,

  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  devtool: true,
};

export default config;
