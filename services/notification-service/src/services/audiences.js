// Who sees a notification that isn't addressed to one user.
//   STAFF  - everyone who runs the school: super admins, admins and staff
//   ADMINS - super admins and admins only (e.g. payroll totals)
// Students only see notifications addressed to them by user id.
const AUDIENCE_ROLES = {
  STAFF: ['SUPER_ADMIN', 'ADMIN', 'STAFF'],
  ADMINS: ['SUPER_ADMIN', 'ADMIN'],
};

const rolesAudiences = (role) => Object.keys(AUDIENCE_ROLES).filter((a) => AUDIENCE_ROLES[a].includes(role));

module.exports = { AUDIENCE_ROLES, rolesAudiences };
