const request = require('supertest');
const app = require('../src/app');
const { publishEvent } = require('../src/services/rabbitmq');
const { setupTestDb, teardownTestDb, fixtures } = require('./helpers/testDb');

// Grades: draft upsert, publish-then-freeze, idempotent publish, and the credit-weighted GPA.

let semesterId, course3cr, course4cr, course2cr;

beforeAll(async () => {
  await setupTestDb();
  const programId = await fixtures.program();
  course3cr = await fixtures.course(programId, 'CS101', 3);
  course4cr = await fixtures.course(programId, 'CS102', 4);
  course2cr = await fixtures.course(programId, 'CS103', 2);
  semesterId = await fixtures.semester('Fall 2026', '2026-09-01', '2026-12-20');
});
afterAll(teardownTestDb);
beforeEach(() => publishEvent.mockClear());

const postGrade = (studentId, courseId, gradeLetter, gradePoints) =>
  request(app).post('/api/v1/grades').send({ studentId, courseId, semesterId, gradeLetter, gradePoints });
const publish = (gradeId) => request(app).put(`/api/v1/grades/${gradeId}/publish`);
const gradeEvents = () => publishEvent.mock.calls.filter(([name]) => name === 'academic.grade.published');

async function enrolledStudent(...courseIds) {
  const id = await fixtures.student();
  for (const c of courseIds) await fixtures.enroll(id, c, semesterId);
  return id;
}

test('first POST creates a draft (201); a second POST corrects the same draft (200)', async () => {
  const studentId = await enrolledStudent(course3cr);
  const created = await postGrade(studentId, course3cr, 'B', 3);
  expect(created.status).toBe(201);
  expect(created.body).toMatchObject({ grade_letter: 'B', grade_points: 3, published: false, published_at: null });

  const corrected = await postGrade(studentId, course3cr, 'a', 4); // lowercase accepted
  expect(corrected.status).toBe(200);
  expect(corrected.body).toMatchObject({ id: created.body.id, grade_letter: 'A', grade_points: 4, published: false });
  expect(gradeEvents()).toHaveLength(0); // drafts never announce anything
});

test('a published grade is frozen: re-posting returns 409 and the grade is unchanged', async () => {
  const studentId = await enrolledStudent(course3cr);
  const draft = (await postGrade(studentId, course3cr, 'C', 2)).body;

  const published = await publish(draft.id);
  expect(published.status).toBe(200);
  expect(published.body).toMatchObject({ published: true, published_at: expect.any(String) });
  expect(gradeEvents()).toHaveLength(1);
  expect(gradeEvents()[0][1]).toEqual({
    studentId, courseId: course3cr, semesterId, gradeLetter: 'C', publishedAt: published.body.published_at,
  });

  const repost = await postGrade(studentId, course3cr, 'A', 4);
  expect(repost.status).toBe(409);
  expect(repost.body.error).toMatch(/already published/);
  const [row] = await fixtures.query('SELECT grade_letter, grade_points FROM grades WHERE id = ?', [draft.id]);
  expect(row).toEqual({ grade_letter: 'C', grade_points: '2.00' });
});

test('publishing is idempotent: a second publish returns 200 and sends no second event', async () => {
  const studentId = await enrolledStudent(course3cr);
  const draft = (await postGrade(studentId, course3cr, 'B', 3)).body;
  expect((await publish(draft.id)).status).toBe(200);
  expect((await publish(draft.id)).status).toBe(200);
  expect(gradeEvents()).toHaveLength(1);
});

test('the upsert guard never overwrites a published grade, even when the controller check is bypassed', async () => {
  // Simulates the race where a grade is published between the controller's check and the upsert.
  const gradeModel = require('../src/models/gradeModel');
  const studentId = await enrolledStudent(course3cr);
  const draft = (await postGrade(studentId, course3cr, 'D', 1)).body;
  await publish(draft.id);

  await gradeModel.recordGrade(studentId, course3cr, semesterId, 'A', 4);
  const after = await gradeModel.getGradeById(draft.id);
  expect(after).toMatchObject({ grade_letter: 'D', grade_points: 1, published: true });
});

test('GPA is credit-weighted over PUBLISHED grades only: sum(points x credits) / sum(credits)', async () => {
  const studentId = await enrolledStudent(course3cr, course4cr, course2cr);
  const a = (await postGrade(studentId, course3cr, 'A', 4)).body; // 4.00 x 3 credits = 12
  const c = (await postGrade(studentId, course4cr, 'C', 2)).body; // 2.00 x 4 credits = 8
  await postGrade(studentId, course2cr, 'F', 0);                  // draft: must not count

  const none = await request(app).get(`/api/v1/students/${studentId}/grades`);
  expect(none.body).toMatchObject({ gpa: null, totalCredits: 0 }); // nothing published yet
  expect(none.body.grades).toHaveLength(3);                          // drafts are still listed

  await publish(a.id);
  await publish(c.id);
  const res = await request(app).get(`/api/v1/students/${studentId}/grades`);
  expect(res.status).toBe(200);
  // (12 + 8) / (3 + 4) = 20 / 7 = 2.857... -> 2.86
  expect(res.body.gpa).toBe(2.86);
  expect(res.body.totalCredits).toBe(7);
  // Unweighted would be (4 + 2) / 2 = 3.00; this proves credit weighting is applied.
  expect(res.body.gpa).not.toBe(3);
});

test('an F counts in the GPA with 0 points', async () => {
  const studentId = await enrolledStudent(course3cr, course4cr);
  for (const [course, letter, points] of [[course3cr, 'B', 3], [course4cr, 'F', 0]]) {
    const g = (await postGrade(studentId, course, letter, points)).body;
    await publish(g.id);
  }
  const res = await request(app).get(`/api/v1/students/${studentId}/grades`);
  expect(res.body.gpa).toBe(1.29); // (3x3 + 0x4) / 7 = 9 / 7 = 1.2857 -> 1.29
});

test('rejects invalid grades (400): letter, points range, precision, and non-enrolled students', async () => {
  const studentId = await enrolledStudent(course3cr);
  expect((await postGrade(studentId, course3cr, 'A+', 4)).status).toBe(400);
  expect((await postGrade(studentId, course3cr, 'A', 4.5)).status).toBe(400);
  expect((await postGrade(studentId, course3cr, 'A', 3.456)).status).toBe(400);
  expect((await postGrade(studentId, course3cr, 'A', '4')).status).toBe(400);

  const outsider = await fixtures.student();
  const res = await postGrade(outsider, course3cr, 'A', 4);
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/not enrolled/);
});
