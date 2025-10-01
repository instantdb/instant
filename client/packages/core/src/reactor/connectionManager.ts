import type { Logger } from '../utils/log.ts';

const WS_CONNECTING_STATUS = 0;
const WS_OPEN_STATUS = 1;

export interface ConnectionManagerDeps {
  createSocket(uri: string): WebSocket;
  websocketURI: string;
  appId: string;
  log: Logger;
  isShutdown(): boolean;
  isOnline(): boolean;
  setStatus(status: string, err?: { message?: string }): void;
  getCurrentUser(): Promise<{ user?: any }>;
  buildInitMessage(refreshToken: string | undefined): any;
  generateEventId(): string;
  shouldLog(op: string): boolean;
  handleReceive(wsId: number, msg: any): void;
  onSocketClosed(): void;
}

export class ConnectionManager {
  private ws: WebSocket | null = null;
  private reconnectDelay = 0;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: ConnectionManagerDeps) {}

  start() {
    if (this.deps.isShutdown()) {
      this.deps.log.info(
        '[socket][start]',
        this.deps.appId,
        'Reactor has been shut down and will not start a new socket',
      );
      return;
    }

    if (this.ws && this.ws.readyState === WS_CONNECTING_STATUS) {
      this.deps.log.info(
        '[socket][start]',
        (this.ws as any)._id,
        'maintained as current ws, we were still in a connecting state',
      );
      return;
    }

    const prevWs = this.ws;
    const uri = `${this.deps.websocketURI}?app_id=${this.deps.appId}`;
    this.ws = this.deps.createSocket(uri);
    this.ws.onopen = this.onOpen;
    this.ws.onmessage = this.onMessage;
    this.ws.onclose = this.onClose;
    this.ws.onerror = this.onError;
    this.deps.log.info('[socket][start]', (this.ws as any)._id);

    if (prevWs?.readyState === WS_OPEN_STATUS) {
      this.deps.log.info(
        '[socket][start]',
        (this.ws as any)._id,
        'close previous ws id = ',
        (prevWs as any)._id,
      );
      prevWs.close();
    }
  }

  send(eventId: string, msg: any) {
    if (!this.ws || this.ws.readyState !== WS_OPEN_STATUS) {
      return;
    }
    if (this.deps.shouldLog(msg.op)) {
      this.deps.log.info('[send]', (this.ws as any)._id, msg.op, msg);
    }
    this.ws.send(JSON.stringify({ 'client-event-id': eventId, ...msg }));
  }

  resetBackoff() {
    this.reconnectDelay = 0;
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
  }

  close() {
    this.ws?.close();
  }

  shutdown() {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private onOpen = (event: Event) => {
    const targetWs = event.target as WebSocket;
    if (this.ws !== targetWs) {
      this.deps.log.info(
        '[socket][open]',
        (targetWs as any)._id,
        'skip; this is no longer the current ws',
      );
      return;
    }

    this.deps.log.info('[socket][open]', (this.ws as any)._id);
    this.resetBackoff();
    this.deps.setStatus('opened');

    this.deps
      .getCurrentUser()
      .then((resp) => {
        const refreshToken = resp.user?.['refresh_token'];
        const payload = this.deps.buildInitMessage(refreshToken);
        this.send(this.deps.generateEventId(), payload);
      })
      .catch((err) => {
        this.deps.log.error('[socket][error]', (this.ws as any)._id, err);
      });
  };

  private onMessage = (event: MessageEvent) => {
    const targetWs = event.target as WebSocket;
    if (this.ws !== targetWs) {
      this.deps.log.info(
        '[socket][message]',
        (targetWs as any)._id,
        event.data,
        'skip; this is no longer the current ws',
      );
      return;
    }

    const payload = JSON.parse(event.data.toString());
    this.deps.handleReceive((this.ws as any)._id, payload);
  };

  private onError = (event: Event) => {
    const targetWs = event.target as WebSocket;
    if (this.ws !== targetWs) {
      this.deps.log.info(
        '[socket][error]',
        (targetWs as any)._id,
        'skip; this is no longer the current ws',
      );
      return;
    }
    this.deps.log.error('[socket][error]', (this.ws as any)._id, event);
  };

  private onClose = (event: CloseEvent) => {
    const targetWs = event.target as WebSocket;
    if (this.ws !== targetWs) {
      this.deps.log.info(
        '[socket][close]',
        (targetWs as any)._id,
        'skip; this is no longer the current ws',
      );
      return;
    }

    const wsId = (targetWs as any)._id;

    this.deps.setStatus('closed');
    this.deps.onSocketClosed();
    this.ws = null;

    if (this.deps.isShutdown()) {
      this.deps.log.info(
        '[socket][close]',
        wsId,
        'Reactor has been shut down and will not reconnect',
      );
      return;
    }

    const wait = this.reconnectDelay;
    this.deps.log.info(
      '[socket][close]',
      wsId,
      'schedule reconnect, ms =',
      wait,
    );

    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;
      const nextDelay = Math.min(wait + 1000, 10000);
      this.reconnectDelay = nextDelay;
      if (!this.deps.isOnline()) {
        this.deps.log.info(
          '[socket][close]',
          wsId,
          'we are offline, no need to start socket',
        );
        return;
      }
      this.start();
    }, wait);
  };
}
