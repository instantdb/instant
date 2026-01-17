export interface EventSourceType {
  readonly url: string;
  readonly readyState: number;

  onopen: ((this: EventSourceType, ev: Event) => any) | null;
  onmessage: ((this: EventSourceType, ev: MessageEvent) => any) | null;
  onerror: ((this: EventSourceType, ev: Event) => any) | null;

  close(): void;
}

export interface EventSourceConstructor {
  OPEN: number;
  CONNECTING: number;
  CLOSED: number;
  new (url: string): EventSourceType;
}

let _connId = 0;

type Conn = EventSourceType | WebSocket;

type OpenEvent<T extends Conn> = {
  target: Connection<T>;
};

type MessageData = {
  op: string;
  [key: string]: any;
};

type SendMessageData = {
  'client-event-id': string;
  [key: string]: any;
};

type MsgEvent<T extends Conn> = {
  target: Connection<T>;
  message: MessageData | MessageData[];
};

type CloseEvent<T extends Conn> = {
  target: Connection<T>;
};

interface ErrorEvent<T extends Conn> {
  target: Connection<T>;
}

export type TransportType = 'ws' | 'sse';

export interface Connection<T extends Conn> {
  conn: T;
  type: 'ws' | 'sse';
  id: string;
  close(): void;
  isOpen(): boolean;
  isConnecting(): boolean;
  send(msg: SendMessageData): void;
  onopen: ((event: OpenEvent<T>) => void) | null;
  onmessage: ((event: MsgEvent<T>) => void) | null;
  onclose: ((event: CloseEvent<T>) => void) | null;
  onerror: ((event: ErrorEvent<T>) => void) | null;
}

export class WSConnection implements Connection<WebSocket> {
  type: TransportType = 'ws';
  conn: WebSocket;
  id: string;
  onopen: (event: OpenEvent<WebSocket>) => void;
  onmessage: (event: MsgEvent<WebSocket>) => void;
  onclose: (event: CloseEvent<WebSocket>) => void;
  onerror: (event: ErrorEvent<WebSocket>) => void;
  constructor(url: string) {
    this.id = `${this.type}_${_connId++}`;
    this.conn = new WebSocket(url);
    this.conn.onopen = (_e) => {
      if (this.onopen) {
        this.onopen({ target: this });
      }
    };
    this.conn.onmessage = (e) => {
      if (this.onmessage) {
        this.onmessage({
          target: this,
          message: JSON.parse(e.data.toString()),
        });
      }
    };
    this.conn.onclose = (_e) => {
      if (this.onclose) {
        this.onclose({ target: this });
      }
    };
    this.conn.onerror = (_e) => {
      if (this.onerror) {
        this.onerror({ target: this });
      }
    };
  }

  close() {
    this.conn.close();
  }

  isOpen(): boolean {
    return this.conn.readyState === (WebSocket.OPEN ?? 1);
  }

  isConnecting(): boolean {
    return this.conn.readyState === (WebSocket.CONNECTING ?? 0);
  }

  send(msg: SendMessageData) {
    return this.conn.send(JSON.stringify(msg));
  }
}

type SSEInitParams = {
  machineId: string;
  sessionId: string;
  sseToken: string;
};

export class SSEConnection implements Connection<EventSourceType> {
  type: TransportType = 'sse';
  private initParams: SSEInitParams | null = null;
  private sendQueue: any[] = [];
  private sendPromise: Promise<void> | null;
  private closeFired: boolean = false;
  private sseInitTimeout: ReturnType<typeof setTimeout> | undefined = undefined;
  private ES: EventSourceConstructor;
  conn: EventSourceType;
  url: string;
  id: string;
  onopen: (event: OpenEvent<EventSourceType>) => void;
  onmessage: (event: MsgEvent<EventSourceType>) => void;
  onclose: (event: CloseEvent<EventSourceType>) => void;
  onerror: (event: ErrorEvent<EventSourceType>) => void;

  constructor(ES: EventSourceConstructor, url: string) {
    this.id = `${this.type}_${_connId++}`;
    this.url = url;
    this.ES = ES;
    this.conn = new ES(url);

    // Close the connection if we didn't get an init within 10 seconds
    this.sseInitTimeout = setTimeout(() => {
      if (!this.initParams) {
        this.handleError();
      }
    }, 10000);

    this.conn.onmessage = (e) => {
      const message = JSON.parse(e.data);
      if (Array.isArray(message)) {
        for (const msg of message) {
          this.handleMessage(msg);
        }
      } else {
        this.handleMessage(message);
      }
    };

    this.conn.onerror = (e) => {
      this.handleError();
    };
  }

  private handleMessage(msg: MessageData) {
    if (msg.op === 'sse-init') {
      this.initParams = {
        machineId: msg['machine-id'],
        sessionId: msg['session-id'],
        sseToken: msg['sse-token'],
      };
      if (this.onopen) {
        this.onopen({ target: this });
      }
      clearTimeout(this.sseInitTimeout);
      return;
    }
    if (this.onmessage) {
      this.onmessage({
        target: this,
        message: msg,
      });
    }
  }

  // Runs the onerror and closes the connection
  private handleError() {
    try {
      if (this.onerror) {
        this.onerror({ target: this });
      }
    } finally {
      this.handleClose();
    }
  }

  private handleClose() {
    this.conn.close();
    if (this.onclose && !this.closeFired) {
      this.closeFired = true;
      this.onclose({ target: this });
    }
  }

  private async postMessages(messages: any[]): Promise<void> {
    try {
      const resp = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machine_id: this.initParams?.machineId,
          session_id: this.initParams?.sessionId,
          sse_token: this.initParams?.sseToken,
          messages,
        }),
      });
      if (!resp.ok) {
        this.handleError();
      }
    } catch (e) {
      this.handleError();
    }
  }

  private async flushQueue() {
    if (this.sendPromise || !this.sendQueue.length) return;

    const messages = this.sendQueue;
    this.sendQueue = [];
    const sendPromise = this.postMessages(messages);
    this.sendPromise = sendPromise;
    sendPromise.then(() => {
      this.sendPromise = null;
      this.flushQueue();
    });
  }

  send(msg: SendMessageData) {
    if (!this.isOpen() || !this.initParams) {
      if (this.isConnecting()) {
        throw new Error(
          `Failed to execute 'send' on 'EventSource': Still in CONNECTING state.`,
        );
      }
      if (this.conn.readyState === this.ES.CLOSED) {
        throw new Error(`EventSource is already in CLOSING or CLOSED state.`);
      }
      throw new Error(`EventSource is in invalid state.`);
    }
    this.sendQueue.push(msg);
    this.flushQueue();
  }

  isOpen(): boolean {
    return this.conn.readyState === this.ES.OPEN && this.initParams !== null;
  }

  isConnecting(): boolean {
    return (
      this.conn.readyState === this.ES.CONNECTING ||
      (this.conn.readyState === this.ES.OPEN && this.initParams === null)
    );
  }

  close() {
    this.handleClose();
  }
}
