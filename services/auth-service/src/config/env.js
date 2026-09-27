// Reads every setting from environment variables in one place.
// If a required value is missing, the service refuses to start instead of running half-configured.
require('dotenv').config({ quiet: true });

const required = ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

const toInt = (value, fallback) => (value === undefined ? fallback : Number.parseInt(value, 10));

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
    maxLoginAttempts: toInt(process.env.MAX_LOGIN_ATTEMPTS, 5),
    lockoutMinutes: toInt(process.env.LOCKOUT_MINUTES, 15),
  },
};
