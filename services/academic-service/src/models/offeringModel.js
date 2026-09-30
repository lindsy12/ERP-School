const pool = require('../db');

// Read-only views over one "offering": a course taught in a semester. There is no instructor
// model yet, so every course/semester pair with enrolled students counts as an offering.

// Matric number shown in the UI; students have no stored matric number yet.
const matricNumber = (id) => `STU${String(id).padStart(6, '0')}`;

async function listOfferings(db = pool) {
  const [rows] = await db.query(
    `SELECT c.id AS course_id, c.code AS course_code, c.title AS course_title, c.credit_hours,
            s.id AS semester_id, s.name AS semester_name,
            s.start_date AS semester_start, s.end_date AS semester_end,
            COUNT(*) AS enrolled_count
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       JOIN semesters s ON s.id = e.semester_id
      WHERE e.status = 'enrolled'
      GROUP BY c.id, c.code, c.title, c.credit_hours, s.id, s.name, s.start_date, s.end_date
      ORDER BY s.start_date DESC, c.code`
  );
  return rows;
}

// Students enrolled in a course for a semester, by last name.
async function getRoster(courseId, semesterId, db = pool) {
  const [rows] = await db.query(
    `SELECT st.id AS student_id, st.first_name, st.last_name, st.email
       FROM enrollments e
       JOIN students st ON st.id = e.student_id
      WHERE e.course_id = ? AND e.semester_id = ? AND e.status = 'enrolled'
      ORDER BY st.last_name, st.first_name`,
    [courseId, semesterId]
  );
  return rows.map((r) => ({ ...r, matric_number: matricNumber(r.student_id) }));
}

// Class sessions of an offering, with how many attendance records each already has.
async function listSessions(courseId, semesterId, db = pool) {
  const [rows] = await db.query(
    `SELECT cs.id, cs.course_id, cs.semester_id, cs.session_date, cs.start_time, cs.end_time, cs.created_at,
            (SELECT COUNT(*) FROM attendance_records ar WHERE ar.session_id = cs.id) AS attendance_count
       FROM class_sessions cs
      WHERE cs.course_id = ? AND cs.semester_id = ?
      ORDER BY cs.session_date, cs.start_time`,
    [courseId, semesterId]
  );
  return rows;
}

// Every grade (draft or published) of an offering.
async function listGrades(courseId, semesterId, db = pool) {
  const [rows] = await db.query(
    `SELECT id, student_id, course_id, semester_id, grade_letter, grade_points, published, published_at, created_at
       FROM grades WHERE course_id = ? AND semester_id = ?`,
    [courseId, semesterId]
  );
  return rows.map((g) => ({ ...g, grade_points: Number(g.grade_points), published: Boolean(g.published) }));
}

module.exports = {
  listOfferings,
  getRoster,
  listSessions,
  listGrades,
};
