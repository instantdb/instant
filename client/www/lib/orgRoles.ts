import { Role } from '@/pages/dash';

const roleScores: Record<Role, number> = {
  owner: 4,
  admin: 3,
  collaborator: 2,
  'app-member': 1,
};

export const getAssignableRoles = ({
  theirRole,
  myRole,
}: {
  theirRole: Role;
  myRole: Role;
}): Role[] => {
  if (roleScores[myRole] <= roleScores['collaborator']) {
    return [];
  }

  if (roleScores[theirRole] > roleScores[myRole]) {
    return [];
  }

  // return any roles equal to or below myRole
  return Object.keys(roleScores).filter(
    (role) =>
      roleScores[role as Role] <= roleScores[myRole] && role !== 'app-member',
  ) as Role[];
};
