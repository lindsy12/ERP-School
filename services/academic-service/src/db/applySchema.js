require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Runs schema.sql (every statement is CREATE TABLE IF NOT EXISTS, so re-running is harmless).
// Uses its own connection because the shared pool does not allow multiple statements per query.
async function applySchema() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });
  try {
    await connection.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  } finally {
    await connection.end();
  }
}

module.exports = applySchema;

if (require.main === module) {
  applySchema()
    .then(() => console.log('Academic schema applied.'))
    .catch((err) => {
      console.error('Applying the schema failed:', err.message);
      process.exit(1);
    });
}
