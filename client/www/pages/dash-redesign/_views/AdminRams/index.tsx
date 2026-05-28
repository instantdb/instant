export { Current as AdminRamsView } from './Current';

export type AdminRamsSubState = 'list' | 'split' | 'table';

export const ADMIN_RAMS_SUB_STATES: {
  key: AdminRamsSubState;
  label: string;
}[] = [
  { key: 'list', label: 'List' },
  { key: 'split', label: 'Split' },
  { key: 'table', label: 'Table' },
];
