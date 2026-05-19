export { Current as AdminView } from './Current';

export type AdminSubState =
  | 'default'
  | 'edit-member'
  | 'invite-member'
  | 'clear-app'
  | 'delete-app';

export const ADMIN_SUB_STATES: { key: AdminSubState; label: string }[] = [
  { key: 'default', label: 'Default' },
  { key: 'edit-member', label: 'Edit member' },
  { key: 'invite-member', label: 'Invite member' },
  { key: 'clear-app', label: 'Clear app' },
  { key: 'delete-app', label: 'Delete app' },
];
