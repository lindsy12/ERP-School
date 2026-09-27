// Prints a JWT signed with this service's JWT_SECRET so the HR UI/API can be used
// before auth-service exists.
//
//   npm run dev-token -- Admin
//   docker compose exec hr-service node scripts/dev-token.js Staff 2
//
// Args: <role: SuperAdmin|Admin|Staff|Student> [userId] [employeeId]
require('dotenv').config();
const jwt = require('jsonwebtoken');

if (process.env.NODE_ENV === 'production') {
  console.error('dev-token refuses to run with NODE_ENV=production');
  process.exit(1);
}

const [role = 'Admin', userId = '1', employeeId] = process.argv.slice(2);
const payload = { id: Number(userId), role };
if (employeeId) payload.employeeId = Number(employeeId);

console.log(jwt.sign(payload, process.env.JWT_SECRET || 'changeme', { expiresIn: '8h' }));
