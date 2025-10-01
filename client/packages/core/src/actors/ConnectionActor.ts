import { BaseActor, Message } from './BaseActor.js';

const WS_CONNECTING_STATUS = 0;
const WS_OPEN_STATUS = 1;

export type ConnectionStatus =
  | 'connecting'
  | 'opened'
  | 'authenticated'
  | 'closed'
  | 'errored';

export interface WebSocketMessage {
  op: string;
  [key: string]: any;
}

export interface IWebSocket {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((event: any) => void) | null;
  onmessage: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onclose: ((event: any) => void) | null;
  _id?: number; // For debugging
}

export interface WebSocketFactory {
  create(url: string): IWebSocket;
}

interface ConnectionState {
  status: ConnectionStatus;
  currentWs: IWebSocket | null;
  wsId: number;
  reconnectTimeoutMs: number;
  reconnectTimeoutId: any | null;
  isShutdown: boolean;
  isOnline: boolean;
  errorMessage: string | null;
}

/**
 * ConnectionActor manages WebSocket lifecycle and reconnection.
 *
 * Receives:
 * - { type: 'network:online' }
 * - { type: 'network:offline' }
 * - { type: 'connection:send', message: object, eventId: string }
 * - { type: 'connection:start' }
 *
 * Publishes:
 * - { type: 'connection:status', status: ConnectionStatus, error?: string }
 * - { type: 'ws:message', wsId: number, message: WebSocketMessage }
 */
export class ConnectionActor extends BaseActor<ConnectionState> {
  private wsFactory: WebSocketFactory;
  private websocketURI: string;
  private appId: string;
  private logger: { info: (...args: any[]) => void; error: (...args: any[]) => void };

  constructor(
    websocketURI: string,
    appId: string,
    wsFactory: WebSocketFactory,
    logger: { info: (...args: any[]) => void; error: (...args: any[]) => void },
  ) {
    super('Connection', {
      status: 'connecting',
      currentWs: null,
      wsId: 0,
      reconnectTimeoutMs: 0,
      reconnectTimeoutId: null,
      isShutdown: false,
      isOnline: true,
      errorMessage: null,
    });

    this.wsFactory = wsFactory;
    this.websocketURI = websocketURI;
    this.appId = appId;
    this.logger = logger;
  }

  receive(message: Message): void {
    switch (message.type) {
      case 'network:online':
        this.state = { ...this.state, isOnline: true };
        this.startSocket();
        break;

      case 'network:offline':
        this.state = { ...this.state, isOnline: false };
        this.setStatus('closed');
        break;

      case 'connection:send':
        this.trySend(message.eventId, message.message);
        break;

      case 'connection:start':
        this.startSocket();
        break;

      case 'ws:init-ok':
        this.setStatus('authenticated');
        this.state = { ...this.state, reconnectTimeoutMs: 0 };
        break;
    }
  }

  private setStatus(status: ConnectionStatus, error?: string): void {
    this.state = {
      ...this.state,
      status,
      errorMessage: error || null,
    };

    this.publish({
      type: 'connection:status',
      status,
      error,
    });
  }

  private trySend(eventId: string, msg: any): void {
    const ws = this.state.currentWs;
    if (!ws || ws.readyState !== WS_OPEN_STATUS) {
      return;
    }

    this.logger.info('[send]', ws._id, msg.op, msg);
    ws.send(JSON.stringify({ 'client-event-id': eventId, ...msg }));
  }

  private startSocket(): void {
    if (this.state.isShutdown) {
      this.logger.info('[socket][start] Reactor has been shut down, not starting socket');
      return;
    }

    const currentWs = this.state.currentWs;

    if (currentWs && currentWs.readyState === WS_CONNECTING_STATUS) {
      this.logger.info('[socket][start] Already connecting, not starting new socket');
      return;
    }

    // Close previous socket if open
    if (currentWs && currentWs.readyState === WS_OPEN_STATUS) {
      this.logger.info('[socket][start] Closing previous socket');
      currentWs.close();
    }

    const wsId = this.state.wsId + 1;
    const url = `${this.websocketURI}?app_id=${this.appId}`;
    const ws = this.wsFactory.create(url);
    ws._id = wsId;

    ws.onopen = (e) => this.handleOpen(ws, e);
    ws.onmessage = (e) => this.handleMessage(ws, e);
    ws.onclose = (e) => this.handleClose(ws, e);
    ws.onerror = (e) => this.handleError(ws, e);

    this.state = {
      ...this.state,
      currentWs: ws,
      wsId,
    };

    this.logger.info('[socket][start]', wsId);
  }

  private handleOpen(targetWs: IWebSocket, _event: any): void {
    if (this.state.currentWs !== targetWs) {
      this.logger.info('[socket][open]', targetWs._id, 'skip; not current ws');
      return;
    }

    this.logger.info('[socket][open]', targetWs._id);
    this.setStatus('opened');
  }

  private handleMessage(targetWs: IWebSocket, event: any): void {
    if (this.state.currentWs !== targetWs) {
      this.logger.info('[socket][message]', targetWs._id, 'skip; not current ws');
      return;
    }

    const message = JSON.parse(event.data.toString());
    this.logger.info('[receive]', targetWs._id, message.op, message);

    this.publish({
      type: 'ws:message',
      wsId: targetWs._id,
      message,
    });
  }

  private handleError(targetWs: IWebSocket, error: any): void {
    if (this.state.currentWs !== targetWs) {
      this.logger.info('[socket][error]', targetWs._id, 'skip; not current ws');
      return;
    }

    this.logger.error('[socket][error]', targetWs._id, error);
  }

  private handleClose(targetWs: IWebSocket, _event: any): void {
    if (this.state.currentWs !== targetWs) {
      this.logger.info('[socket][close]', targetWs._id, 'skip; not current ws');
      return;
    }

    this.setStatus('closed');

    if (this.state.isShutdown) {
      this.logger.info('[socket][close]', targetWs._id, 'shutdown, not reconnecting');
      return;
    }

    const reconnectMs = this.state.reconnectTimeoutMs;
    this.logger.info('[socket][close]', targetWs._id, 'reconnecting in', reconnectMs);

    const timeoutId = setTimeout(() => {
      const newReconnectMs = Math.min(reconnectMs + 1000, 10000);
      this.state = {
        ...this.state,
        reconnectTimeoutMs: newReconnectMs,
        reconnectTimeoutId: null,
      };

      if (!this.state.isOnline) {
        this.logger.info('[socket][close] offline, not reconnecting');
        return;
      }

      this.startSocket();
    }, reconnectMs);

    this.state = {
      ...this.state,
      reconnectTimeoutId: timeoutId,
    };
  }

  getStatus(): ConnectionStatus {
    return this.state.status;
  }

  shutdown(): void {
    super.shutdown();

    this.state = {
      ...this.state,
      isShutdown: true,
    };

    if (this.state.reconnectTimeoutId) {
      clearTimeout(this.state.reconnectTimeoutId);
    }

    if (this.state.currentWs) {
      this.state.currentWs.close();
    }
  }
}
