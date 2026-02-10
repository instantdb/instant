const localPort = process.env.EXPO_PUBLIC_LOCAL_SERVER_PORT || '8888';

const config = {
  appId: process.env.EXPO_PUBLIC_INSTANT_APP_ID,
  apiURI: `http://localhost:${localPort}`,
  websocketURI: `ws://localhost:${localPort}/runtime/session`,
  verbose: true,
};

export default config;
