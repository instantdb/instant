import { getLocal, setLocal } from './config';

function key(orgId?: string | null): string {
  const effectiveOrgId = orgId || 'personal';
  return `${effectiveOrgId}-pinned-apps`;
}

export function getPinnedAppIds(orgId?: string | null): Set<string> {
  const ids: string[] = getLocal(key(orgId)) || [];
  return new Set(ids);
}

export function togglePinnedApp(appId: string, orgId?: string | null) {
  const pinned = getPinnedAppIds(orgId);
  if (pinned.has(appId)) {
    pinned.delete(appId);
  } else {
    pinned.add(appId);
  }
  setLocal(key(orgId), [...pinned]);
}
