import { getLocal, setLocal } from './config';

export type LocallySavedApp = {
  id: string;
  orgId?: string | null;
};

export function getLocallySavedApp(
  orgId?: string | null,
): LocallySavedApp | undefined {
  const effectiveOrgId = orgId || 'personal';
  const key = `${effectiveOrgId}-locally-saved-app`;
  return getLocal(key);
}

export function setLocallySavedApp(app: LocallySavedApp) {
  const effectiveOrgId = app.orgId || 'personal';
  const key = `${effectiveOrgId}-locally-saved-app`;
  setLocal(key, app);
}
