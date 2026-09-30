const bcrypt = require('bcryptjs');
const { security } = require('../config/env');

// bcrypt only looks at the first 72 bytes; anything longer would be silently cut off.
const MAX_PASSWORD_BYTES = 72;
// For passwords set through the API (new accounts, changes, resets). The seed's SUPER_ADMIN needs 12.
const MIN_PASSWORD_LENGTH = 8;

async function hashPassword(plain) {
  if (Buffer.byteLength(plain, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new Error(`Password must be at most ${MAX_PASSWORD_BYTES} bytes`);
  }
  return bcrypt.hash(plain, security.bcryptSaltRounds);
}

function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

module.exports = { hashPassword, verifyPassword, MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH };
