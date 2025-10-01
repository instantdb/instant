import { BaseActor, Message } from './BaseActor.js';

/**
 * WebSocket message from server
 */
export interface WSMessage {
  op: string;
  [key: string]: any;
}

/**
 * Routed message with type prefix
 */
export interface RoutedMessage extends Message {
  type: string; // e.g., 'ws:init-ok'
  payload: WSMessage;
}

interface MessageRouterState {
  messageCount: number;
}

/**
 * MessageRouterActor routes incoming WebSocket messages to interested parties.
 *
 * Receives: { type: 'ws:message', wsId: number, message: WSMessage }
 * Publishes: { type: 'ws:<op>', wsId: number, payload: WSMessage }
 */
export class MessageRouterActor extends BaseActor<MessageRouterState> {
  constructor() {
    super('MessageRouter', { messageCount: 0 });
  }

  receive(message: Message): void {
    if (message.type === 'ws:message') {
      this.routeMessage(message.wsId, message.message);
    }
  }

  private routeMessage(wsId: number, wsMessage: WSMessage): void {
    if (!wsMessage.op) {
      console.error('WebSocket message missing "op" field:', wsMessage);
      return;
    }

    this.state = {
      messageCount: this.state.messageCount + 1,
    };

    // Publish message with prefixed type
    const routedMessage: RoutedMessage = {
      type: `ws:${wsMessage.op}`,
      wsId,
      payload: wsMessage,
    };

    this.publish(routedMessage);
  }

  getMessageCount(): number {
    return this.state.messageCount;
  }
}
