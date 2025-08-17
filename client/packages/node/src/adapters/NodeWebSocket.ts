import WebSocket from 'ws';

// Wrapper to make the 'ws' package compatible with browser WebSocket API
export class NodeWebSocket extends WebSocket {
  // The 'ws' package already implements most of the browser WebSocket API
  // We just need to ensure compatibility and add any missing pieces
  
  constructor(url: string, protocols?: string | string[]) {
    // In development, we might need to ignore SSL certificate errors
    const options: any = {};
    if (process.env.NODE_ENV !== 'production' && url.startsWith('wss://')) {
      options.rejectUnauthorized = false;
    }
    super(url, protocols, options);
  }
  
  // The ws library already supports onopen, onmessage, onerror, and onclose properties
  // We don't need to add any custom event handling - it works out of the box!
}

// Export as default to match browser WebSocket usage
export default NodeWebSocket;