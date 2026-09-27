// Applies every file in ./migrations that hasn't been applied yet, in filename order,
// and records it in the schema_migrations table so it never runs twice.
//
// Rules for migration files:
//   - Never edit a file once teammates have run it; add a new numbered file instead.
//   - MySQL cannot roll back CREATE/ALTER TABLE, so keep each file to one change.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { db } = require('../config/env');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function migrate() {
  const conn = await mysql.createConnection({ ...db, timezone: 'Z', multipleStatements: true });
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    VARCHAR(255) NOT NULL PRIMARY KEY,
        applied_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const [rows] = await conn.query('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.version));

    const pending = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql') && !applied.has(file))
      .sort();

    if (pending.length === 0) {
      console.log('Database is up to date.');
      return;
    }

    for (const file of pending) {
      console.log(`Applying ${file}`);
      await conn.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
      await conn.query('INSERT INTO schema_migrations (version) VALUES (?)', [file]);
    }
    console.log(`Applied ${pending.length} migration(s).`);
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  migrate().catch((err) => {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  });
}

module.exports = migrate;
