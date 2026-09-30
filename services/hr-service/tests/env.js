const fs = require('fs');
const path = require('path');

// Prefer a local .env.test (gitignored) if present, otherwise fall back to .env
// — this is where DB_HOST/DB_PORT/DB_USER/DB_PASSWORD come from for a local
// `npm test` run against a real MySQL instance (see README for setup).
const envTestPath = path.join(__dirname, '..', '.env.test');
require('dotenv').config({ path: fs.existsSync(envTestPath) ? envTestPath : path.join(__dirname, '..', '.env') });

process.env.JWT_SECRET = 'test-secret';
process.env.QR_SECRET = 'test-qr-secret';
