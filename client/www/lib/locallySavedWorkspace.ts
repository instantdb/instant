import { getLocal, setLocal } from './config';

const locallySavedWorkspaceKey = 'docs-locally-saved-workspace';

export function getLocallySavedWorkspace(): string | null {
  return getLocal(locallySavedWorkspaceKey);
}

export function setLocallySavedWorkspace(workspaceId: string) {
  setLocal(locallySavedWorkspaceKey, workspaceId);
}
