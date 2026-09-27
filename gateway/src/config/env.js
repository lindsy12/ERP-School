// Reads every setting from environment variables in one place.
// If a required value is missing, the gateway refuses to start instead of running half-configured.
require('dotenv').config({ quiet: true });

const required = [
  'AUTH_SERVICE_URL',
  'ACADEMIC_SERVICE_URL',
  'FINANCE_SERVICE_URL',
  'HR_SERVICE_URL',
  'NOTIFICATION_SERVICE_URL',
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

const toInt = (value, fallback) => (value === undefined || value === '' ? fallback : Number.parseInt(value, 10));

// Express "trust proxy": false (no proxy), a hop count ("1"), or a list of trusted proxy IPs/subnets.
function parseTrustProxy(value) {
  if (value === undefined || value === '' || value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  if (value === 'true') {
    throw new Error('TRUST_PROXY=true would let any client fake its IP; use a hop count like 1 instead');
  }
  return value; // e.g. "loopback, 10.0.0.0/8"
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: toInt(process.env.PORT, 3000),
  serviceUrls: {
    auth: process.env.AUTH_SERVICE_URL,
    academic: process.env.ACADEMIC_SERVICE_URL,
    finance: process.env.FINANCE_SERVICE_URL,
    hr: process.env.HR_SERVICE_URL,
    notification: process.env.NOTIFICATION_SERVICE_URL,
  },
  proxyTimeoutMs: toInt(process.env.PROXY_TIMEOUT_MS, 10000),
  healthTimeoutMs: toInt(process.env.HEALTH_TIMEOUT_MS, 2000),
  verifyTimeoutMs: toInt(process.env.VERIFY_TIMEOUT_MS, 3000),
  rateLimitWindowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 60000),
  rateLimitMax: toInt(process.env.RATE_LIMIT_MAX, 100),
  authRateLimitMax: toInt(process.env.AUTH_RATE_LIMIT_MAX, 10),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  corsOrigins: (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};
