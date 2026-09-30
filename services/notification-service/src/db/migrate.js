require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./connection');

// Runs every .sql file in migrations/ in name order. They only use CREATE TABLE IF NOT EXISTS,
// so running them again is harmless; the server does it at startup.
async function runMigrations({ log = console.log } = {}) {
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    log(`running ${file}`);
    await pool.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  }
}

module.exports = { runMigrations };

if (require.main === module) {
  runMigrations()
    .then(() => pool.end())
    .catch(async (err) => {
      console.error('Migration failed:', err.message);
      await pool.end().catch(() => {});
      process.exit(1);
    });
}
