// Reads every setting from environment variables in one place.
// If a required value is missing, the service refuses to start instead of running half-configured.
require('dotenv').config({ quiet: true });

const required = ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

const toInt = (value, fallback) => (value === undefined ? fallback : Number.parseInt(value, 10));

// For settings where 0, a negative number or a typo would silently switch a protection off.
function positiveInt(name, value, fallback) {
  const parsed = toInt(value, fallback);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: toInt(process.env.PORT, 4001),
  db: {
    host: process.env.DB_HOST,
    port: toInt(process.env.DB_PORT, 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    accessTokenMinutes: toInt(process.env.ACCESS_TOKEN_MINUTES, 15),
    refreshTokenDays: toInt(process.env.REFRESH_TOKEN_DAYS, 7),
  },
  security: {
    bcryptSaltRounds: toInt(process.env.BCRYPT_SALT_ROUNDS, 10),
    // MAX_LOGIN_ATTEMPTS is the old name, still read so existing .env files keep working.
    maxFailedAttempts: positiveInt(
      'MAX_FAILED_ATTEMPTS',
      process.env.MAX_FAILED_ATTEMPTS ?? process.env.MAX_LOGIN_ATTEMPTS,
      5,
    ),
    lockoutMinutes: positiveInt('LOCKOUT_MINUTES', process.env.LOCKOUT_MINUTES, 15),
  },
};
