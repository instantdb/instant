// MessageEvent is not supported in the edge runtime, vercel
// defines its own MessageEvent that throws. There is no easy
// way to detect if MessageEvent is supported, so we just always
// polyfill by passing it in to eventsource.
export class MessageEventPolyfill<T = any> extends Event {
  readonly data: T;
  readonly origin: string;
  readonly lastEventId: string;
  readonly source: MessageEventSource | null;
  readonly ports: ReadonlyArray<MessagePort>;
  constructor(
    type: string,
    init?: {
      data?: T;
      origin?: string;
      lastEventId?: string;
      source?: MessageEventSource | null;
      ports?: MessagePort[];
    },
  ) {
    super(type);
    this.data = init?.data ?? (null as T);
    this.origin = init?.origin ?? '';
    this.lastEventId = init?.lastEventId ?? '';
    this.source = init?.source ?? null;
    this.ports = init?.ports ?? [];
  }
  /** @deprecated */
  initMessageEvent(
    _type: string,
    _bubbles?: boolean,
    _cancelable?: boolean,
    _data?: any,
    _origin?: string,
    _lastEventId?: string,
    _source?: MessageEventSource | null,
    _ports?: MessagePort[],
  ) {}
}
