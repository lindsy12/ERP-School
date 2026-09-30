const request = require('supertest');
const app = require('../src/app');
const { publishEvent } = require('../src/services/rabbitmq'); // the Jest mock from setup/mocks.js
const { setupTestDb, teardownTestDb, fixtures } = require('./helpers/testDb');

// Enrollment: prerequisite enforcement (the core business rule), duplicates, and the
// academic.student.enrolled event that Finance relies on for invoicing.

let fall, spring, cs101, cs102, cs201;

beforeAll(async () => {
  await setupTestDb();
  const programId = await fixtures.program();
  cs101 = await fixtures.course(programId, 'CS101');
  cs102 = await fixtures.course(programId, 'CS102');
  cs201 = await fixtures.course(programId, 'CS201');
  await fixtures.prerequisite(cs201, cs101);
  await fixtures.prerequisite(cs201, cs102);
  fall = await fixtures.semester('Fall 2026', '2026-09-01', '2026-12-20');
  spring = await fixtures.semester('Spring 2027', '2027-01-15', '2027-05-20');
});
afterAll(teardownTestDb);
beforeEach(() => publishEvent.mockClear());

const enroll = (studentId, courseId, semesterId) =>
  request(app).post('/api/v1/enrollments').send({ studentId, courseId, semesterId });
const enrolledEvents = () => publishEvent.mock.calls.filter(([name]) => name === 'academic.student.enrolled');

test('successful enrollment returns 201 and publishes academic.student.enrolled with tuition', async () => {
  const studentId = await fixtures.student();
  const res = await enroll(studentId, cs101, fall);

  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ student_id: studentId, course_id: cs101, semester_id: fall, status: 'enrolled' });
  expect(enrolledEvents()).toHaveLength(1);
  expect(enrolledEvents()[0][1]).toEqual({
    studentId, courseId: cs101, semesterId: fall,
    enrolledAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/), tuitionAmount: 150000,
  });
});

test('missing prerequisites block enrollment with 409 naming every missing course', async () => {
  const studentId = await fixtures.student();
  const res = await enroll(studentId, cs201, fall);

  expect(res.status).toBe(409);
  expect(res.body.error).toMatch(/Prerequisites not met for CS201/);
  expect(res.body.error).toMatch(/CS101/);
  expect(res.body.error).toMatch(/CS102/);
  expect(res.body.missingPrerequisites.map(c => c.code)).toEqual(['CS101', 'CS102']);
  expect(enrolledEvents()).toHaveLength(0); // no event for a refused enrollment
});

test('a prerequisite only counts if taken in a semester that ENDED before the target starts', async () => {
  const studentId = await fixtures.student();
  expect((await enroll(studentId, cs101, fall)).status).toBe(201);

  // Same semester: CS101 in Fall doesn't count for CS201 in Fall.
  const sameSemester = await enroll(studentId, cs201, fall);
  expect(sameSemester.status).toBe(409);
  expect(sameSemester.body.missingPrerequisites.map(c => c.code)).toEqual(['CS101', 'CS102']);

  // Next semester: CS101 now counts, only CS102 is missing (and named).
  const partly = await enroll(studentId, cs201, spring);
  expect(partly.status).toBe(409);
  expect(partly.body.missingPrerequisites.map(c => c.code)).toEqual(['CS102']);
  expect(partly.body.error).not.toMatch(/CS101/);

  expect((await enroll(studentId, cs102, fall)).status).toBe(201);
  expect((await enroll(studentId, cs201, spring)).status).toBe(201);
});

test('a DROPPED prerequisite enrollment does not satisfy the prerequisite', async () => {
  const studentId = await fixtures.student();
  await fixtures.enroll(studentId, cs101, fall, 'dropped');
  await fixtures.enroll(studentId, cs102, fall);

  const res = await enroll(studentId, cs201, spring);
  expect(res.status).toBe(409);
  expect(res.body.missingPrerequisites.map(c => c.code)).toEqual(['CS101']);
});

test('enrolling twice in the same course and semester is blocked with 409 (and no second event)', async () => {
  const studentId = await fixtures.student();
  expect((await enroll(studentId, cs102, fall)).status).toBe(201);
  const dup = await enroll(studentId, cs102, fall);

  expect(dup.status).toBe(409);
  expect(dup.body.error).toMatch(/already enrolled/);
  expect(enrolledEvents()).toHaveLength(1);
  const rows = await fixtures.query('SELECT COUNT(*) AS n FROM enrollments WHERE student_id = ? AND course_id = ?', [studentId, cs102]);
  expect(rows[0].n).toBe(1);
});

test('rejects bad input (400) before any database work', async () => {
  const missing = await request(app).post('/api/v1/enrollments').send({ studentId: 1 });
  expect(missing.status).toBe(400);
  expect(missing.body.error).toBe('Missing required field(s): courseId, semesterId');

  const unknownStudent = await enroll(999999, cs101, fall);
  expect(unknownStudent.status).toBe(400);
  expect(unknownStudent.body.error).toMatch(/studentId 999999 does not exist/);
});
