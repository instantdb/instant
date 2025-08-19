import { getLocal, setLocal } from './config';

export type LocallySavedApp = {
  id: string;
};

export function getLocallySavedApp(): LocallySavedApp | undefined {
  return getLocal('locally-saved-app');
}

export function setLocallySavedApp(app: LocallySavedApp) {
  setLocal('locally-saved-app', app);
}
