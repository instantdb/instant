export { Current as OAuthAppsView } from './Current';

export type OAuthAppsSubState =
  | 'list'
  | 'create-app'
  | 'app-detail'
  | 'create-client'
  | 'client-secret';

export const OAUTH_APPS_SUB_STATES: {
  key: OAuthAppsSubState;
  label: string;
}[] = [
  { key: 'list', label: 'List' },
  { key: 'create-app', label: 'Create app' },
  { key: 'app-detail', label: 'App detail' },
  { key: 'create-client', label: 'Create client' },
  { key: 'client-secret', label: 'Copy client secret' },
];
