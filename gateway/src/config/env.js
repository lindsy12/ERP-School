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
  corsOrigins: (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};
