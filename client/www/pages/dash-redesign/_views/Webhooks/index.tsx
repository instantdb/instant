export { Current as WebhooksView } from './Current';

export type WebhooksSubState =
  | 'empty'
  | 'list'
  | 'list-with-disabled'
  | 'create'
  | 'edit'
  | 'disable'
  | 'delete'
  | 'events';

export const WEBHOOKS_SUB_STATES: {
  key: WebhooksSubState;
  label: string;
}[] = [
  { key: 'list', label: 'List · active only' },
  { key: 'list-with-disabled', label: 'List · with disabled' },
  { key: 'empty', label: 'Empty' },
  { key: 'create', label: 'Create dialog' },
  { key: 'edit', label: 'Edit dialog' },
  { key: 'disable', label: 'Disable dialog' },
  { key: 'delete', label: 'Delete dialog' },
  { key: 'events', label: 'Webhook events' },
];
