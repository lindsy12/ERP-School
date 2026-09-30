require('dotenv').config();
const pool = require('../db');
const applySchema = require('./applySchema');

// Demo data for a presentation: one program, four courses, two semesters, ten students and their
// Fall 2026 enrollments. Run once with `npm run seed` (in Docker:
// `docker compose exec academic-service npm run seed`). It refuses to run if programs already
// exist, so it never mixes with real data. Enrollments inserted here publish no event (no invoice
// is created); enrol a student through the API to show the academic -> finance flow.

const COURSES = [
  ['SEN4121', 'Software Architecture', 4],
  ['SEN4103', 'Database Systems', 4],
  ['SEN4115', 'Web Engineering', 3],
  ['SEN4130', 'Software Project Management', 3],
];
const STUDENTS = [
  ['Amara', 'Ngu'], ['Brice', 'Tchoumi'], ['Chantal', 'Mbah'], ['Daniel', 'Fon'], ['Esther', 'Njoya'],
  ['Fabrice', 'Kamga'], ['Grace', 'Ebai'], ['Herve', 'Nkeng'], ['Ines', 'Tabi'], ['Joel', 'Atangana'],
];

async function seed() {
  await applySchema();
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM programs');
  if (n > 0) {
    console.log('Programs already exist; nothing seeded.');
    return;
  }

  const [program] = await pool.query(
    'INSERT INTO programs (name, description) VALUES (?, ?)',
    ['BSc Software Engineering', 'Four-year software engineering degree']
  );
  const courseIds = [];
  for (const [code, title, credits] of COURSES) {
    const [r] = await pool.query(
      'INSERT INTO courses (program_id, code, title, credit_hours) VALUES (?, ?, ?, ?)',
      [program.insertId, code, title, credits]
    );
    courseIds.push(r.insertId);
  }
  await pool.query(
    'INSERT INTO semesters (name, start_date, end_date) VALUES (?, ?, ?), (?, ?, ?)',
    ['Spring 2026', '2026-01-12', '2026-05-22', 'Fall 2026', '2026-09-01', '2026-12-20']
  );
  const [[fall]] = await pool.query("SELECT id FROM semesters WHERE name = 'Fall 2026'");

  const studentIds = [];
  for (const [first, last] of STUDENTS) {
    const [r] = await pool.query(
      'INSERT INTO students (first_name, last_name, email) VALUES (?, ?, ?)',
      [first, last, `${first}.${last}@student.school.cm`.toLowerCase()]
    );
    studentIds.push(r.insertId);
  }
  // Everyone takes the first two courses; half the class also takes the third.
  for (const [i, studentId] of studentIds.entries()) {
    const taken = i % 2 === 0 ? courseIds.slice(0, 3) : courseIds.slice(0, 2);
    for (const courseId of taken) {
      await pool.query(
        'INSERT INTO enrollments (student_id, course_id, semester_id) VALUES (?, ?, ?)',
        [studentId, courseId, fall.id]
      );
    }
  }
  console.log(`Seeded 1 program, ${courseIds.length} courses, 2 semesters, ${studentIds.length} students.`);
}

seed()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Seeding failed:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
