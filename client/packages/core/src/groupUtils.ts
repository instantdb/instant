import id from './utils/id.ts';

export function generateInviteCode(): string {
  return id();
}

export function createGroup(name: string, ownerId: string) {
  const groupId = id();
  return {
    groupId,
    groupTx: { id: groupId, name, ownerId },
  };
}

export function addMember(groupId: string, userId: string) {
  const membershipId = id();
  return {
    membershipId,
    membershipTx: { id: membershipId, groupId, userId },
  };
}

export type InviteMetadata = Record<string, unknown>;

export function createInvite(
  groupId: string,
  invitedBy: string,
  metadata: InviteMetadata = {},
) {
  const inviteId = id();
  const code = generateInviteCode();
  return {
    inviteId,
    code,
    inviteTx: { id: inviteId, groupId, invitedBy, code, metadata },
  };
}

export function redeemInvite(
  inviteCode: string,
  groupId: string,
  userId: string,
  metadata?: InviteMetadata,
) {
  const membershipId = id();
  return {
    membershipId,
    membershipTx: { id: membershipId, groupId, userId, inviteCode, metadata },
  };
}
}
