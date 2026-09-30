// Runs before any application code in every test file (Jest `setupFiles`).
//
// WHAT: points src/db.js at a separate TEST database, so the tests never touch the dev data.
// WHY here: src/db.js builds its connection pool from process.env the moment it's first
// required, so these variables must be set before any app module loads. dotenv (used by db.js)
// never overwrites variables that are already set, so these values win over .env.
//
// Configure with (all optional):
//   TEST_DB_NAME      default academic_db_test (must contain "test"; see the guard below)
//   TEST_DB_HOST      default 127.0.0.1
//   TEST_DB_PORT      default 3307 (the academic-db port published by docker-compose)
//   TEST_DB_USER      default DB_USER from .env, else root
//   TEST_DB_PASSWORD  default DB_PASSWORD from .env
// The user needs rights to CREATE/DROP DATABASE and CREATE TRIGGER (root is simplest).

require('dotenv').config({ quiet: true });

const devDbName = process.env.DB_NAME;
const testDbName = process.env.TEST_DB_NAME || 'academic_db_test';

// Safety guard: every test file DROPS this database, so refuse anything that could be real.
if (!/^[A-Za-z0-9_]+$/.test(testDbName) || !/test/i.test(testDbName) || testDbName === devDbName) {
  throw new Error(
    `Refusing to run tests against database "${testDbName}". TEST_DB_NAME must contain "test", ` +
      `use only letters, digits and underscores, and differ from the dev database (DB_NAME="${devDbName}"). ` +
      'The test suite drops and recreates this database.'
  );
}

process.env.DB_NAME = testDbName;
process.env.DB_HOST = process.env.TEST_DB_HOST || '127.0.0.1';
process.env.DB_PORT = process.env.TEST_DB_PORT || '3307';
process.env.DB_USER = process.env.TEST_DB_USER || process.env.DB_USER || 'root';
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD ?? process.env.DB_PASSWORD ?? '';

// Enrollment refuses to run without a tuition amount; give it a known one to assert on.
process.env.TUITION_AMOUNT = '150000';
