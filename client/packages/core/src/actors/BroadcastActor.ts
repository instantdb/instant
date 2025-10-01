import { BaseActor, Message } from './BaseActor.js';

interface BroadcastSubscription {
  roomId: string;
  topic: string;
  callback: (data: any, peer: any) => void;
}

interface BroadcastState {
  subscriptions: BroadcastSubscription[];
  queue: Array<{ roomId: string; topic: string; data: any }>;
  connectedRooms: Set<string>;
}

/**
 * BroadcastActor manages topic-based pub/sub in rooms.
 *
 * Receives:
 * - { type: 'broadcast:subscribe', roomId, topic, callback }
 * - { type: 'broadcast:unsubscribe', roomId, topic, callback }
 * - { type: 'broadcast:publish', roomId, topic, data }
 * - { type: 'ws:server-broadcast', payload }
 * - { type: 'presence:updated', roomId, presence } -> to get peer data
 *
 * Publishes:
 * - { type: 'connection:send', eventId, message }
 */
export class BroadcastActor extends BaseActor<BroadcastState> {
  private presenceCache: Map<string, any> = new Map();

  constructor() {
    super('Broadcast', {
      subscriptions: [],
      queue: [],
      connectedRooms: new Set(),
    });
  }

  receive(message: Message): void {
    switch (message.type) {
      case 'broadcast:subscribe':
        this.subscribeTopic(message.roomId, message.topic, message.callback);
        break;

      case 'broadcast:unsubscribe':
        this.unsubscribeTopic(message.roomId, message.topic, message.callback);
        break;

      case 'broadcast:publish':
        this.publishToTopic(message.roomId, message.topic, message.data);
        break;

      case 'ws:server-broadcast':
        this.handleServerBroadcast(message.payload);
        break;

      case 'presence:updated':
        this.handlePresenceUpdate(message.roomId, message.presence);
        break;

      case 'ws:join-room-ok':
        this.handleRoomConnected(message.payload['room-id']);
        break;
    }
  }

  private subscribeTopic(roomId: string, topic: string, callback: (data: any, peer: any) => void): void {
    this.state.subscriptions.push({ roomId, topic, callback });
  }

  private unsubscribeTopic(roomId: string, topic: string, callback: (data: any, peer: any) => void): void {
    this.state.subscriptions = this.state.subscriptions.filter(
      (sub) =>
        !(sub.roomId === roomId && sub.topic === topic && sub.callback === callback),
    );
  }

  private publishToTopic(roomId: string, topic: string, data: any): void {
    if (!this.state.connectedRooms.has(roomId)) {
      this.state.queue.push({ roomId, topic, data });
      return;
    }

    this.tryBroadcast(roomId, topic, data);
  }

  private tryBroadcast(roomId: string, topic: string, data: any): void {
    const eventId = this.generateEventId();
    this.publish({
      type: 'connection:send',
      eventId,
      message: {
        op: 'client-broadcast',
        'room-id': roomId,
        topic,
        data,
      },
    });
  }

  private handleServerBroadcast(payload: any): void {
    const roomId = payload['room-id'];
    const topic = payload.topic;
    const data = payload.data?.data;
    const peerId = payload.data?.['peer-id'];

    const subs = this.state.subscriptions.filter(
      (sub) => sub.roomId === roomId && sub.topic === topic,
    );

    const presence = this.presenceCache.get(roomId);
    const peer = peerId === presence?.sessionId
      ? presence?.user
      : presence?.peers?.[peerId];

    subs.forEach((sub) => {
      try {
        sub.callback(data, peer);
      } catch (e) {
        console.error('[BroadcastActor] Error in subscription callback:', e);
      }
    });
  }

  private handlePresenceUpdate(roomId: string, presence: any): void {
    this.presenceCache.set(roomId, presence);
  }

  private handleRoomConnected(roomId: string): void {
    this.state.connectedRooms.add(roomId);

    // Flush queued broadcasts
    const toSend = this.state.queue.filter((item) => item.roomId === roomId);
    this.state.queue = this.state.queue.filter((item) => item.roomId !== roomId);

    toSend.forEach(({ roomId, topic, data }) => {
      this.tryBroadcast(roomId, topic, data);
    });
  }

  private generateEventId(): string {
    return `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getSubscriptionCount(roomId: string, topic: string): number {
    return this.state.subscriptions.filter(
      (sub) => sub.roomId === roomId && sub.topic === topic,
    ).length;
  }
}
