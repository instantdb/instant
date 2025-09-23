import { getLocal, setLocal } from './config';

export type LocallySavedApp = {
  id: string;
  orgId: string;
};

export function getLocallySavedApp(orgId: string): LocallySavedApp | undefined {
  return getLocal(`${orgId}-locally-saved-app`);
}

export function setLocallySavedApp(app: LocallySavedApp) {
  setLocal(`${app.orgId}-locally-saved-app`, app);
}
