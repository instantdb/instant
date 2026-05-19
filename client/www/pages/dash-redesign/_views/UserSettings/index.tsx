export { Current as UserSettingsView } from './Current';

export type UserSettingsSubState =
  | 'tokens'
  | 'oauth'
  | 'invites'
  | 'token-created';

export const USER_SETTINGS_SUB_STATES: {
  key: UserSettingsSubState;
  label: string;
}[] = [
  { key: 'tokens', label: 'Access Tokens' },
  { key: 'oauth', label: 'OAuth Apps' },
  { key: 'invites', label: 'Invites' },
  { key: 'token-created', label: 'Copy your token' },
];
