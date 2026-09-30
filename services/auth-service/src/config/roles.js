// The four roles (same names as the roles table, see migration 001) and who may manage whom.
const ROLES = ['SUPER_ADMIN', 'ADMIN', 'STAFF', 'STUDENT'];

// Which roles each role may create, edit, reset or unlock, always inside its own school.
// Nobody manages their own role or peers: an ADMIN cannot demote or disable another ADMIN,
// and SUPER_ADMIN accounts are only created by `npm run seed`.
const MANAGEABLE_ROLES = {
  SUPER_ADMIN: ['ADMIN', 'STAFF', 'STUDENT'],
  ADMIN: ['STAFF', 'STUDENT'],
  STAFF: [],
  STUDENT: [],
};

const canManage = (actorRole, targetRole) => (MANAGEABLE_ROLES[actorRole] || []).includes(targetRole);

module.exports = { ROLES, MANAGEABLE_ROLES, canManage };
