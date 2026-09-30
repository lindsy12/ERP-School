const request = require('supertest');
const app = require('../src/app');
const { publishEvent } = require('../src/services/rabbitmq');
const { checkAndFlagStudent } = require('../src/services/atRiskCheck');
const { setupTestDb, teardownTestDb, fixtures } = require('./helpers/testDb');

// At-risk flag. The rule:
//   at risk if (a) attendance percentage < 75, OR (b) the two most recent PUBLISHED grades are both F.
// Checks run automatically after attendance batches and grade publishes, and
// academic.student.at_risk_flagged must fire ONCE per transition into at-risk, not on every check.

let semesterId, programId, attCourse;

beforeAll(async () => {
  await setupTestDb();
  programId = await fixtures.program();
  attCourse = await fixtures.course(programId, 'ATT101');
  semesterId = await fixtures.semester('Fall 2026', '2026-09-01', '2026-12-20');
});
afterAll(teardownTestDb);
beforeEach(() => publishEvent.mockClear());

const flaggedEvents = (studentId) => publishEvent.mock.calls
  .filter(([name, payload]) => name === 'academic.student.at_risk_flagged' && payload.studentId === studentId);
const atRisk = async (studentId) => (await request(app).get(`/api/v1/academic/students/${studentId}/at-risk`)).body;

let day = 1;
// Creates a new session for the course and records `status` for the student through the API,
// which triggers the automatic at-risk check.
async function attend(studentId, status, courseId = attCourse) {
  const date = `2026-09-${String(day++).padStart(2, '0')}`;
  const sessionId = (await request(app).post('/api/v1/academic/sessions').send({ courseId, semesterId, sessionDate: date, startTime: '09:00', endTime: '10:00' })).body.id;
  const res = await request(app).post('/api/v1/academic/attendance').send({ sessionId, records: [{ studentId, status }] });
  expect(res.status).toBe(201);
}

async function publishGrade(studentId, courseId, letter, points) {
  const g = (await request(app).post('/api/v1/academic/grades').send({ studentId, courseId, semesterId, gradeLetter: letter, gradePoints: points })).body;
  const res = await request(app).put(`/api/v1/academic/grades/${g.id}/publish`);
  expect(res.status).toBe(200);
  return g.id;
}

describe('rule (a): attendance below 75%', () => {
  test('flags the student, fires ONE event per transition, clears at exactly 75%, and re-flags on relapse', async () => {
    const st = await fixtures.student();
    await fixtures.enroll(st, attCourse, semesterId);

    await attend(st, 'absent'); // 0/1 = 0%   -> becomes at risk
    let live = await atRisk(st);
    expect(live).toMatchObject({ isAtRisk: true, reasons: ['attendance_below_75'] });
    expect(live.storedFlag).toMatchObject({ is_at_risk: true, reasons: ['attendance_below_75'], cleared_at: null });
    expect(flaggedEvents(st)).toHaveLength(1);
    expect(flaggedEvents(st)[0][1]).toEqual({ studentId: st, reasons: ['attendance_below_75'], flaggedAt: expect.any(String) });

    await attend(st, 'present'); // 1/2 = 50%  -> still at risk
    await attend(st, 'present'); // 2/3 = 67%  -> still at risk
    expect(flaggedEvents(st)).toHaveLength(1); // re-checks while at risk must NOT re-notify

    await attend(st, 'present'); // 3/4 = 75%  -> NOT below 75 -> cleared
    live = await atRisk(st);
    expect(live.isAtRisk).toBe(false);
    expect(live.storedFlag).toMatchObject({ is_at_risk: false, reasons: [], cleared_at: expect.any(String) });
    expect(flaggedEvents(st)).toHaveLength(1); // leaving at-risk sends nothing

    await attend(st, 'absent');  // 3/5 = 60%  -> at risk AGAIN: a new transition, a new event
    expect((await atRisk(st)).storedFlag).toMatchObject({ is_at_risk: true, cleared_at: null });
    expect(flaggedEvents(st)).toHaveLength(2);
  });

  test("'late' counts as not present, so a mostly-late student is at risk", async () => {
    // Own course: registers taken in ATT101 by earlier tests would count against this student.
    const lateCourse = await fixtures.course(programId, 'LATE101');
    const st = await fixtures.student();
    await fixtures.enroll(st, lateCourse, semesterId);
    await attend(st, 'present', lateCourse);
    await attend(st, 'late', lateCourse);
    const live = await atRisk(st);
    expect(live.details.attendancePercentage).toBe(50);
    expect(live.isAtRisk).toBe(true);
  });
});

describe('rule (b): two most recent published grades both F', () => {
  let c1, c2, c3;
  beforeAll(async () => {
    c1 = await fixtures.course(programId, 'GR101');
    c2 = await fixtures.course(programId, 'GR102');
    c3 = await fixtures.course(programId, 'GR103');
  });

  test('two consecutive published Fs flag the student; a newer passing grade clears it', async () => {
    const st = await fixtures.student();
    for (const c of [c1, c2, c3]) await fixtures.enroll(st, c, semesterId);

    await publishGrade(st, c1, 'F', 0);
    expect((await atRisk(st)).isAtRisk).toBe(false); // only one F so far

    // An F that's only a DRAFT must not count.
    await request(app).post('/api/v1/academic/grades').send({ studentId: st, courseId: c2, semesterId, gradeLetter: 'F', gradePoints: 0 });
    expect((await atRisk(st)).isAtRisk).toBe(false);

    await publishGrade(st, c2, 'F', 0); // now the two most recent published grades are F, F
    const live = await atRisk(st);
    expect(live).toMatchObject({ isAtRisk: true, reasons: ['two_consecutive_fails'] });
    expect(live.details.lastTwoPublishedGrades.map(g => g.gradeLetter)).toEqual(['F', 'F']);
    expect(flaggedEvents(st)).toHaveLength(1);
    expect(flaggedEvents(st)[0][1].reasons).toEqual(['two_consecutive_fails']);

    await publishGrade(st, c3, 'A', 4); // most recent two are now A, F
    expect((await atRisk(st)).isAtRisk).toBe(false);
    expect(flaggedEvents(st)).toHaveLength(1);
  });

  test('a student already at risk for attendance who then fails twice gets BOTH reasons, but no second event', async () => {
    const st = await fixtures.student();
    for (const c of [attCourse, c1, c2]) await fixtures.enroll(st, c, semesterId);
    await attend(st, 'absent');
    expect(flaggedEvents(st)).toHaveLength(1);

    await publishGrade(st, c1, 'F', 0);
    await publishGrade(st, c2, 'F', 0);
    const live = await atRisk(st);
    expect(live.reasons).toEqual(['attendance_below_75', 'two_consecutive_fails']);
    expect(live.storedFlag.reasons).toEqual(['attendance_below_75', 'two_consecutive_fails']);
    expect(flaggedEvents(st)).toHaveLength(1);
  });
});

describe('transition safety and the advisor list', () => {
  test('three simultaneous checks for the same student produce exactly ONE transition and ONE event', async () => {
    const st = await fixtures.student();
    await fixtures.enroll(st, attCourse, semesterId);
    // Record absences straight into the DB, so no automatic check has run yet (a "missed trigger").
    const sessionId = await fixtures.session(attCourse, semesterId, '2026-12-01');
    await fixtures.query('INSERT INTO attendance_records (session_id, student_id, status) VALUES (?, ?, ?)', [sessionId, st, 'absent']);

    const live = await atRisk(st);
    expect(live.isAtRisk).toBe(true);  // live evaluation sees it...
    expect(live.storedFlag).toBeNull(); // ...the stored flag doesn't yet, and the GET changed nothing
    expect(flaggedEvents(st)).toHaveLength(0);

    const results = await Promise.all([checkAndFlagStudent(st), checkAndFlagStudent(st), checkAndFlagStudent(st)]);
    expect(results.filter(r => r.becameAtRisk)).toHaveLength(1);
    expect(flaggedEvents(st)).toHaveLength(1);
  });

  test('GET /at-risk-students lists exactly the students whose stored flag is at risk', async () => {
    const res = await request(app).get('/api/v1/academic/at-risk-students');
    expect(res.status).toBe(200);
    const [{ n }] = await fixtures.query('SELECT COUNT(*) AS n FROM at_risk_flags WHERE is_at_risk = TRUE');
    expect(res.body).toHaveLength(n);
    for (const s of res.body) expect(s).toMatchObject({ student_id: expect.any(Number), first_name: expect.any(String), reasons: expect.any(Array) });
  });

  test('checkAndFlagStudent never throws, even for an unknown student', async () => {
    await expect(checkAndFlagStudent(999999)).resolves.toBeNull();
  });
});
