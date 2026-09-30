const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Test database lifecycle and data fixtures.
//
// Each test file calls setupTestDb() in beforeAll and teardownTestDb() in afterAll, so every
// file starts from an empty, freshly migrated database and leaves nothing behind.
// The database name comes from tests/setup/env.js (TEST_DB_NAME, default academic_db_test).

const SCHEMA_PATH = path.join(__dirname, '..', '..', 'src', 'db', 'schema.sql');
const DB_NAME = process.env.DB_NAME; // already switched to the TEST database by setup/env.js

// A standalone connection with no default database (so it can CREATE/DROP one) and
// multipleStatements, so schema.sql can run in a single query.
function adminConnection() {
  return mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });
}

// Drops any leftover test database (e.g. from a crashed run), recreates it, and applies the
// real schema.sql, so tests run against exactly the schema the service ships with.
async function setupTestDb() {
  const conn = await adminConnection();
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
    await conn.query(`CREATE DATABASE \`${DB_NAME}\``);
    await conn.query(`USE \`${DB_NAME}\``);
    await conn.query(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  } finally {
    await conn.end();
  }
}

// Closes the app's connection pool (otherwise Jest reports an open handle) and drops the database.
async function teardownTestDb() {
  await require('../../src/db').end();
  const conn = await adminConnection();
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
  } finally {
    await conn.end();
  }
}

// ---------- fixtures ----------
// Students and semesters have no API endpoints yet, so tests insert them directly.
// Everything under test goes through the HTTP API.

const pool = () => require('../../src/db');

async function insert(sql, params) {
  const [result] = await pool().query(sql, params);
  return result.insertId;
}

let uniq = 0;
const fixtures = {
  program: (name = `Program ${++uniq}`) =>
    insert('INSERT INTO programs (name) VALUES (?)', [name]),

  course: (programId, code, creditHours = 3, title = `${code} title`) =>
    insert('INSERT INTO courses (program_id, code, title, credit_hours) VALUES (?, ?, ?, ?)', [programId, code, title, creditHours]),

  prerequisite: (courseId, prerequisiteCourseId) =>
    insert('INSERT INTO course_prerequisites (course_id, prerequisite_course_id) VALUES (?, ?)', [courseId, prerequisiteCourseId]),

  student: (first = 'Test', last = `Student${++uniq}`) =>
    insert('INSERT INTO students (first_name, last_name, email) VALUES (?, ?, ?)', [first, last, `${first}.${last}.${uniq}@example.test`.toLowerCase()]),

  semester: (name, startDate, endDate) =>
    insert('INSERT INTO semesters (name, start_date, end_date) VALUES (?, ?, ?)', [name, startDate, endDate]),

  enroll: (studentId, courseId, semesterId, status = 'enrolled') =>
    insert('INSERT INTO enrollments (student_id, course_id, semester_id, status) VALUES (?, ?, ?, ?)', [studentId, courseId, semesterId, status]),

  session: (courseId, semesterId, date, start = '09:00', end = '10:00') =>
    insert('INSERT INTO class_sessions (course_id, semester_id, session_date, start_time, end_time) VALUES (?, ?, ?, ?, ?)', [courseId, semesterId, date, start, end]),

  // Runs arbitrary SQL against the test database (used for state the API can't create, e.g. dropping a course).
  query: async (sql, params) => (await pool().query(sql, params))[0],
};

module.exports = { setupTestDb, teardownTestDb, fixtures };
