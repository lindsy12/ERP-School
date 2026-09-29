const pool = require('../db');

// Data-access functions for the `grades` table.
// Each function runs exactly one SQL query and takes an optional `db` argument (defaults to
// the shared pool), matching the other models.

const GRADE_COLUMNS = `id, student_id, course_id, semester_id, grade_letter, grade_points,
  published, published_at, created_at`;

// Converts a raw grades row into clean JSON types.
// Why: mysql2 returns DECIMAL as a string ("3.70", so exact values aren't lost to floats)
// and BOOLEAN as 0/1, because MySQL's BOOLEAN is really TINYINT(1). Clients should get
// 3.7 and true/false.
function toGrade(row) {
  if (!row) return null;
  return { ...row, grade_points: Number(row.grade_points), published: Boolean(row.published) };
}

// Creates the grade for (student, course, semester), or corrects the existing one if it
// hasn't been published yet.
//
// Why a single upsert (INSERT ... ON DUPLICATE KEY UPDATE) instead of "SELECT, then INSERT or
// UPDATE": the UNIQUE (student_id, course_id, semester_id) key makes MySQL choose atomically,
// so two simultaneous requests can't both insert.
// Why the IF(grades.published, old, new): once a grade is published it is frozen. If the
// existing row is published, each column is set to its own current value, i.e. nothing
// changes. This guard sits inside the same statement, so even a publish that lands a
// millisecond earlier can't be overwritten. The controller then re-reads the row and, if
// it's published, reports 409.
// `AS new` names the incoming row (MySQL 8.0.19+; replaces the deprecated VALUES() function).
async function recordGrade(studentId, courseId, semesterId, gradeLetter, gradePoints, db = pool) {
  await db.query(
    `INSERT INTO grades (student_id, course_id, semester_id, grade_letter, grade_points)
     VALUES (?, ?, ?, ?, ?) AS new
     ON DUPLICATE KEY UPDATE
       grade_letter = IF(grades.published, grades.grade_letter, new.grade_letter),
       grade_points = IF(grades.published, grades.grade_points, new.grade_points)`,
    [studentId, courseId, semesterId, gradeLetter, gradePoints]
  );
}

// Returns the grade for one (student, course, semester), or null if none has been recorded.
// Why: the upsert above doesn't reliably say whether it inserted or updated, so the
// controller looks up the row before (to choose 201 vs 200) and after (to return it).
async function getGradeByKey(studentId, courseId, semesterId, db = pool) {
  const [rows] = await db.query(
    `SELECT ${GRADE_COLUMNS} FROM grades
      WHERE student_id = ? AND course_id = ? AND semester_id = ?`,
    [studentId, courseId, semesterId]
  );
  return toGrade(rows[0]);
}

// Returns one grade by id, or null if not found.
// Why: publish works on a grade id, and needs the row for the 404 check and the event payload.
async function getGradeById(id, db = pool) {
  const [rows] = await db.query(`SELECT ${GRADE_COLUMNS} FROM grades WHERE id = ?`, [id]);
  return toGrade(rows[0]);
}

// Marks a grade as published, stamping published_at with the current time.
// Returns 1 if this call published it, 0 if it was already published (or doesn't exist).
// Why "AND published = FALSE": it makes publishing happen exactly once. If two publish requests
// race, only one UPDATE matches, so only that request fires academic.grade.published. Students
// don't get two "your grade is out" notifications.
async function publishGrade(gradeId, db = pool) {
  const [result] = await db.query(
    `UPDATE grades SET published = TRUE, published_at = NOW()
      WHERE id = ? AND published = FALSE`,
    [gradeId]
  );
  return result.affectedRows;
}

// Returns all of a student's grades (drafts and published), with course and semester details,
// in semester order.
// Why drafts are included: there is no auth yet, so this serves staff too. Each row has a
// `published` flag. Once auth exists, a student viewing their own grades should only see
// published ones.
async function getGradesForStudent(studentId, db = pool) {
  const [rows] = await db.query(
    `SELECT g.id, g.student_id,
            g.course_id, c.code AS course_code, c.title AS course_title, c.credit_hours,
            g.semester_id, sem.name AS semester_name,
            g.grade_letter, g.grade_points, g.published, g.published_at, g.created_at
       FROM grades g
       JOIN courses c     ON c.id = g.course_id
       JOIN semesters sem ON sem.id = g.semester_id
      WHERE g.student_id = ?
      ORDER BY sem.start_date, c.code`,
    [studentId]
  );
  return rows.map(toGrade);
}

// Returns the student's cumulative GPA across all PUBLISHED grades, weighted by credit hours:
//
//          sum( grade_points_i * credit_hours_i )
//   GPA = ---------------------------------------      over every published grade i
//                  sum( credit_hours_i )
//
// e.g. A (4.00) in a 3-credit course and C (2.00) in a 4-credit course:
//   (4.00*3 + 2.00*4) / (3 + 4) = 20 / 7 = 2.86
//
// Why weighted: a 4-credit course is more of the student's workload than a 1-credit one, so
// it should move the GPA more. F grades (0.00) are included; they pull the GPA down, as
// they should. Drafts are excluded: an unpublished grade can still change.
// The division and rounding happen in SQL on DECIMAL values, so the result is exact before
// rounding to 2 places. Returns { gpa, totalCredits }, with gpa = null if there are no
// published grades yet (rather than a misleading 0.00).
async function getGPA(studentId, db = pool) {
  const [rows] = await db.query(
    `SELECT ROUND(SUM(g.grade_points * c.credit_hours) / SUM(c.credit_hours), 2) AS gpa,
            COALESCE(SUM(c.credit_hours), 0) AS total_credits
       FROM grades g
       JOIN courses c ON c.id = g.course_id
      WHERE g.student_id = ? AND g.published = TRUE`,
    [studentId]
  );
  return {
    gpa: rows[0].gpa === null ? null : Number(rows[0].gpa),
    totalCredits: Number(rows[0].total_credits),
  };
}

module.exports = {
  recordGrade,
  getGradeByKey,
  getGradeById,
  publishGrade,
  getGradesForStudent,
  getGPA,
};
