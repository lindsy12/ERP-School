// Prints a JWT shaped like auth-service's access token (sub/role/tenant_id — see
// docs/api-contracts/auth-service.md) but signed locally, so the HR UI/API can be used
// without the gateway or auth-service running.
//
//   npm run dev-token -- ADMIN
//   npm run dev-token -- STAFF <tenantId> <userId>
//   docker compose exec hr-service node scripts/dev-token.js STAFF
//
// Args: <role: SUPER_ADMIN|ADMIN|STAFF|STUDENT> [tenantId] [userId]
require('dotenv').config();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

if (process.env.NODE_ENV === 'production') {
  console.error('dev-token refuses to run with NODE_ENV=production');
  process.exit(1);
}

const DEV_TENANT_ID = '00000000-0000-4000-8000-000000000001';

const [role = 'ADMIN', tenantId = DEV_TENANT_ID, userId = crypto.randomUUID()] = process.argv.slice(2);
const payload = { sub: userId, role, tenant_id: tenantId };

console.log(jwt.sign(payload, process.env.JWT_SECRET || 'changeme', { expiresIn: '8h' }));
