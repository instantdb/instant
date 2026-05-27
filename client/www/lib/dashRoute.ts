export const personalWorkspaceId = 'personal';

export type WorkspaceId = typeof personalWorkspaceId | string;

export function workspaceQuery(workspaceId: WorkspaceId | null | undefined) {
  return workspaceId && workspaceId !== personalWorkspaceId
    ? { org: workspaceId }
    : {};
}
