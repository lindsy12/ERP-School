const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Prefer a local .env.test (gitignored) if present, otherwise fall back to .env.
const envTestPath = path.join(__dirname, '..', '.env.test');
require('dotenv').config({ path: fs.existsSync(envTestPath) ? envTestPath : path.join(__dirname, '..', '.env') });

// Runs once before the whole test run: creates the test database if it
// doesn't exist yet. Individual test files then use sequelize.sync({force})
// to reset tables between tests (see tests/helpers.js resetDb).
module.exports = async () => {
  const dbName = process.env.DB_NAME || 'hr_db_test';
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  await connection.end();
};
