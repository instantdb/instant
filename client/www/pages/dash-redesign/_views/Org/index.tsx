export { Current as OrgView } from './Current';

export type OrgSubState = 'members' | 'billing' | 'manage' | 'empty';

export const ORG_SUB_STATES: { key: OrgSubState; label: string }[] = [
  { key: 'members', label: 'Members' },
  { key: 'billing', label: 'Usage & Billing' },
  { key: 'manage', label: 'Manage' },
  { key: 'empty', label: 'Empty (new app)' },
];
