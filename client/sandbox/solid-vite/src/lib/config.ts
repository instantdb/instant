const localPort = import.meta.env.VITE_LOCAL_SERVER_PORT || '8888';

const config = {
  apiURI: `http://localhost:${localPort}`,
  websocketURI: `ws://localhost:${localPort}/runtime/session`,
};

export default config;
