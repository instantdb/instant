export { Current as AuthView } from './Current';

export type AuthSubState =
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
