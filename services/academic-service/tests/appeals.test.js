const request = require('supertest');
const app = require('../src/app');
const { publishEvent } = require('../src/services/rabbitmq');
const { setupTestDb, teardownTestDb, fixtures } = require('./helpers/testDb');

// Grade appeals: who can appeal what, one open appeal per grade, the status machine
// (pending -> under_review -> resolved_*), and the approve-with-regrade transaction.

let semesterId, programId;

beforeAll(async () => {
  await setupTestDb();
  programId = await fixtures.program();
  semesterId = await fixtures.semester('Fall 2026', '2026-09-01', '2026-12-20');
});
afterAll(teardownTestDb);
beforeEach(() => publishEvent.mockClear());

let n = 0;
// A student with one grade in a fresh course; published unless told otherwise.
async function gradedStudent(letter = 'C', points = 2, { publish = true } = {}) {
  const courseId = await fixtures.course(programId, `AP${++n}`);
  const studentId = await fixtures.student();
  await fixtures.enroll(studentId, courseId, semesterId);
  const grade = (await request(app).post('/api/v1/grades').send({ studentId, courseId, semesterId, gradeLetter: letter, gradePoints: points })).body;
  if (publish) await request(app).put(`/api/v1/grades/${grade.id}/publish`);
  return { studentId, courseId, gradeId: grade.id };
}
const fileAppeal = (gradeId, studentId, reason = 'Please re-check question 3.') =>
  request(app).post(`/api/v1/grades/${gradeId}/appeals`).send({ studentId, reason });
const setStatus = (appealId, body) => request(app).put(`/api/v1/appeals/${appealId}/status`).send(body);
const gradeRow = async (gradeId) => (await fixtures.query('SELECT grade_letter, grade_points, published FROM grades WHERE id = ?', [gradeId]))[0];

describe('filing an appeal', () => {
  test('only a PUBLISHED grade can be appealed (400 for a draft)', async () => {
    const { studentId, gradeId } = await gradedStudent('C', 2, { publish: false });
    const res = await fileAppeal(gradeId, studentId);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('GRADE_NOT_PUBLISHED');
  });

  test("a student can't appeal someone else's grade (400)", async () => {
    const { gradeId } = await gradedStudent();
    const other = await fixtures.student();
    const res = await fileAppeal(gradeId, other);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('STUDENT_MISMATCH');
  });

  test('creates a pending appeal (201) and allows only one OPEN appeal per grade (409)', async () => {
    const { studentId, gradeId } = await gradedStudent('C', 2);
    const first = await fileAppeal(gradeId, studentId);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ status: 'pending', original_grade_letter: 'C', current_grade_letter: 'C' });

    const second = await fileAppeal(gradeId, studentId, 'Again');
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('OPEN_APPEAL_EXISTS');
  });

  test('simultaneous appeals for one grade: exactly one is accepted (unique index backstop)', async () => {
    const { studentId, gradeId } = await gradedStudent();
    const results = await Promise.all(Array.from({ length: 5 }, () => fileAppeal(gradeId, studentId)));
    expect(results.filter(r => r.status === 201)).toHaveLength(1);
    expect(results.filter(r => r.status === 409)).toHaveLength(4);
  });
});

describe('status transitions', () => {
  test('invalid transitions are rejected with 400 and change nothing', async () => {
    const { studentId, gradeId } = await gradedStudent();
    const appeal = (await fileAppeal(gradeId, studentId)).body;

    // Can't skip review.
    const skip = await setStatus(appeal.id, { status: 'resolved_approved', instructorResponse: 'ok' });
    expect(skip.status).toBe(400);
    expect(skip.body.code).toBe('INVALID_TRANSITION');
    expect(skip.body.error).toMatch(/from pending to resolved_approved/);
    expect((await request(app).get(`/api/v1/appeals/${appeal.id}`)).body.status).toBe('pending');

    expect((await setStatus(appeal.id, { status: 'under_review' })).status).toBe(200);
    // Same-state "transition" is invalid too.
    expect((await setStatus(appeal.id, { status: 'under_review' })).body.code).toBe('INVALID_TRANSITION');
    // Resolving requires a response to the student.
    const noResponse = await setStatus(appeal.id, { status: 'resolved_rejected', instructorResponse: '   ' });
    expect(noResponse.status).toBe(400);
    expect(noResponse.body.code).toBe('RESPONSE_REQUIRED');

    const rejected = await setStatus(appeal.id, { status: 'resolved_rejected', instructorResponse: 'Mark confirmed.' });
    expect(rejected.status).toBe(200);
    expect(rejected.body).toMatchObject({ status: 'resolved_rejected', resolved_at: expect.any(String) });

    // Resolved is final.
    const reopen = await setStatus(appeal.id, { status: 'under_review' });
    expect(reopen.status).toBe(400);
    expect(reopen.body.error).toMatch(/already resolved/);
    expect(await gradeRow(gradeId)).toMatchObject({ grade_letter: 'C' }); // rejection never touches the grade
  });

  test('a new grade is only accepted together with resolved_approved', async () => {
    const { studentId, gradeId } = await gradedStudent();
    const appeal = (await fileAppeal(gradeId, studentId)).body;
    await setStatus(appeal.id, { status: 'under_review' });

    const withReject = await setStatus(appeal.id, { status: 'resolved_rejected', instructorResponse: 'no', newGradeLetter: 'A', newGradePoints: 4 });
    expect(withReject.status).toBe(400);
    const half = await setStatus(appeal.id, { status: 'resolved_approved', instructorResponse: 'ok', newGradeLetter: 'A' });
    expect(half.status).toBe(400);
    expect((await request(app).get(`/api/v1/appeals/${appeal.id}`)).body.status).toBe('under_review');
  });
});

describe('approve with a new grade', () => {
  test('actually changes the published grade, keeps the original on the appeal, re-publishes, and notifies', async () => {
    const { studentId, courseId, gradeId } = await gradedStudent('F', 0);
    const appeal = (await fileAppeal(gradeId, studentId, 'My total was added up wrong.')).body;
    await setStatus(appeal.id, { status: 'under_review' });
    publishEvent.mockClear();

    const res = await setStatus(appeal.id, {
      status: 'resolved_approved', instructorResponse: 'Recounted: 58/100, a C.', newGradeLetter: 'C', newGradePoints: 2,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'resolved_approved', original_grade_letter: 'F', original_grade_points: 0,
      current_grade_letter: 'C', current_grade_points: 2, instructor_response: 'Recounted: 58/100, a C.',
    });

    // The grade row itself changed, and is still published.
    expect(await gradeRow(gradeId)).toEqual({ grade_letter: 'C', grade_points: '2.00', published: 1 });
    const grades = (await request(app).get(`/api/v1/students/${studentId}/grades`)).body;
    expect(grades.grades.find(g => g.id === gradeId)).toMatchObject({ grade_letter: 'C', published: true });
    expect(grades.gpa).toBe(2);

    // The regrade goes out through the normal publish flow.
    const events = publishEvent.mock.calls.filter(([name]) => name === 'academic.grade.published');
    expect(events).toHaveLength(1);
    expect(events[0][1]).toMatchObject({ studentId, courseId, semesterId, gradeLetter: 'C' });

    // A second approval can't regrade again.
    const again = await setStatus(appeal.id, { status: 'resolved_approved', instructorResponse: 'x', newGradeLetter: 'A', newGradePoints: 4 });
    expect(again.status).toBe(400);
    expect(await gradeRow(gradeId)).toMatchObject({ grade_letter: 'C' });
  });

  test('ROLLBACK: if the regrade fails midway, the appeal stays under_review and the grade stays published and unchanged', async () => {
    const { studentId, gradeId } = await gradedStudent('B', 3);
    const appeal = (await fileAppeal(gradeId, studentId)).body;
    await setStatus(appeal.id, { status: 'under_review' });
    const [before] = await fixtures.query('SELECT grade_letter, grade_points, published, published_at FROM grades WHERE id = ?', [gradeId]);

    // Make the regrade's recordGrade step fail, AFTER the appeal status update and the
    // un-publish have already run inside the transaction.
    await fixtures.query(`CREATE TRIGGER test_fail_regrade BEFORE UPDATE ON grades FOR EACH ROW
      BEGIN IF NEW.grade_letter = 'D' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'simulated failure mid-regrade'; END IF; END`);
    try {
      publishEvent.mockClear();
      const res = await setStatus(appeal.id, { status: 'resolved_approved', instructorResponse: 'to D', newGradeLetter: 'D', newGradePoints: 1 });
      expect(res.status).toBe(500);

      const after = (await request(app).get(`/api/v1/appeals/${appeal.id}`)).body;
      expect(after).toMatchObject({ status: 'under_review', resolved_at: null });
      const [row] = await fixtures.query('SELECT grade_letter, grade_points, published, published_at FROM grades WHERE id = ?', [gradeId]);
      expect(row).toEqual(before); // published, same letter, same published_at
      expect(publishEvent).not.toHaveBeenCalled(); // nothing announced for a rolled-back change
    } finally {
      await fixtures.query('DROP TRIGGER test_fail_regrade');
    }

    // Once the fault is gone, the same request succeeds.
    const retry = await setStatus(appeal.id, { status: 'resolved_approved', instructorResponse: 'to D', newGradeLetter: 'D', newGradePoints: 1 });
    expect(retry.status).toBe(200);
    expect(await gradeRow(gradeId)).toMatchObject({ grade_letter: 'D', published: 1 });
  });
});
