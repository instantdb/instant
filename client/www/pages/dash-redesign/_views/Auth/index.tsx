export { Current as AuthView } from './Current';

export type AuthSubState =
  | 'flow-drill'
  | 'flow-master'
  | 'flow-merged'
  | 'flow-sheet'
  | 'redesign-quiet-panels'
  | 'redesign-quiet-rows'
  | 'redesign-quiet-column'
  | 'redesign-tracks'
  | 'redesign-columns'
  | 'redesign-focused'
  | 'clients-empty'
  | 'clients-overview'
  | 'picker'
  | 'add-google-dev'
  | 'add-google-custom'
  | 'client-success'
  | 'google-dev-creds'
  | 'google-custom-creds'
  | 'google-edit-creds'
  | 'origins-list'
  | 'origins-add'
  | 'test-users'
  | 'magic-email';

export const AUTH_SUB_STATES: { key: AuthSubState; label: string }[] = [
  { key: 'flow-drill', label: 'Flow · drill-in' },
  { key: 'flow-master', label: 'Flow · master-detail' },
  { key: 'flow-merged', label: 'Flow · merged nav' },
  { key: 'flow-sheet', label: 'Flow · sheet' },
  { key: 'redesign-quiet-panels', label: 'Quiet · two panels' },
  { key: 'redesign-quiet-rows', label: 'Quiet · settings rows' },
  { key: 'redesign-quiet-column', label: 'Quiet · one column' },
  { key: 'redesign-tracks', label: 'Bold · stacked tracks' },
  { key: 'redesign-columns', label: 'Bold · two columns' },
  { key: 'redesign-focused', label: 'Bold · focused method' },
  { key: 'clients-overview', label: 'Clients · overview' },
  { key: 'clients-empty', label: 'Clients · empty' },
  { key: 'picker', label: 'Add client · picker' },
  { key: 'add-google-dev', label: 'Add Google · dev creds' },
  { key: 'add-google-custom', label: 'Add Google · custom creds' },
  { key: 'client-success', label: 'Client · just-added' },
  { key: 'google-dev-creds', label: 'Google · dev creds' },
  { key: 'google-custom-creds', label: 'Google · custom creds' },
  { key: 'google-edit-creds', label: 'Google · edit creds' },
  { key: 'origins-list', label: 'Origins · list' },
  { key: 'origins-add', label: 'Origins · add form' },
  { key: 'test-users', label: 'Test users' },
  { key: 'magic-email', label: 'Magic code email' },
];
