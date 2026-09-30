const request = require('supertest');
const app = require('../src/app');
const { setupTestDb, teardownTestDb, fixtures } = require('./helpers/testDb');

// Attendance: session creation rules, all-or-nothing batch recording, and how the
// attendance percentage is calculated (which sessions and which courses count).

let semesterId, courseX, courseY;

beforeAll(async () => {
  await setupTestDb();
  const programId = await fixtures.program();
  courseX = await fixtures.course(programId, 'CSX01');
  courseY = await fixtures.course(programId, 'CSY01');
  semesterId = await fixtures.semester('Fall 2026', '2026-09-01', '2026-12-20');
});
afterAll(teardownTestDb);

const createSession = (courseId, sessionDate, startTime = '09:00', endTime = '10:00') =>
  request(app).post('/api/v1/academic/sessions').send({ courseId, semesterId, sessionDate, startTime, endTime });
const record = (sessionId, records) => request(app).post('/api/v1/academic/attendance').send({ sessionId, records });
const summary = async (studentId) => (await request(app).get(`/api/v1/academic/students/${studentId}/attendance`)).body.summary;

describe('class sessions', () => {
  test('creates a session (201); rejects dates outside the semester (400) and duplicates (409)', async () => {
    const ok = await createSession(courseX, '2026-09-07');
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ session_date: '2026-09-07', start_time: '09:00:00', end_time: '10:00:00' });

    const outside = await createSession(courseX, '2027-01-10');
    expect(outside.status).toBe(400);
    expect(outside.body.error).toMatch(/outside Fall 2026/);

    const dup = await createSession(courseX, '2026-09-07', '09:00', '09:30');
    expect(dup.status).toBe(409);

    const backwards = await createSession(courseX, '2026-09-08', '10:00', '09:00');
    expect(backwards.status).toBe(400);
  });
});

describe('batch recording', () => {
  let s1, s2, outsider, sessionId;

  beforeAll(async () => {
    s1 = await fixtures.student(); s2 = await fixtures.student(); outsider = await fixtures.student();
    await fixtures.enroll(s1, courseX, semesterId);
    await fixtures.enroll(s2, courseX, semesterId);
    sessionId = (await createSession(courseX, '2026-09-09')).body.id;
  });

  test('a batch containing a non-enrolled student is rejected with 400 and saves NOTHING', async () => {
    const res = await record(sessionId, [
      { studentId: s1, status: 'present' },
      { studentId: outsider, status: 'present' },
    ]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(new RegExp(`not enrolled.*${outsider}`));
    const rows = await fixtures.query('SELECT COUNT(*) AS n FROM attendance_records WHERE session_id = ?', [sessionId]);
    expect(rows[0].n).toBe(0); // s1's valid record was not saved either
  });

  test('records a whole session at once (201) and returns the full register', async () => {
    const res = await record(sessionId, [
      { studentId: s1, status: 'present' },
      { studentId: s2, status: 'late' },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.records).toHaveLength(2);
    expect(res.body.records.map(r => [r.student_id, r.status]).sort()).toEqual([[s1, 'present'], [s2, 'late']].sort());
  });

  test('marking a student twice for the same session returns 409 naming them, and saves nothing', async () => {
    const res = await record(sessionId, [{ studentId: s1, status: 'absent' }]);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(new RegExp(`studentId\\(s\\) ${s1}`));
    const [row] = await fixtures.query('SELECT status FROM attendance_records WHERE session_id = ? AND student_id = ?', [sessionId, s1]);
    expect(row.status).toBe('present'); // unchanged
  });

  test('the same student twice within one batch is a 400, not a confusing 409', async () => {
    const other = (await createSession(courseX, '2026-09-10')).body.id;
    const res = await record(other, [{ studentId: s1, status: 'present' }, { studentId: s1, status: 'late' }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/more than once/);
  });

  test('DB-level rollback: if any insert in the batch fails, the whole batch is rolled back', async () => {
    // Bypass the API's pre-checks to force a UNIQUE violation inside the transaction.
    const attendanceModel = require('../src/models/attendanceModel');
    const fresh = (await createSession(courseX, '2026-09-11')).body.id;
    await expect(attendanceModel.recordAttendance(fresh, [
      { studentId: s1, status: 'present' },
      { studentId: s1, status: 'late' },
    ])).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    const rows = await fixtures.query('SELECT COUNT(*) AS n FROM attendance_records WHERE session_id = ?', [fresh]);
    expect(rows[0].n).toBe(0);
  });
});

describe('attendance percentage', () => {
  test('counts present / sessions-with-a-register; late is not present; untaken sessions are ignored', async () => {
    const programId = await fixtures.program();
    const courseW = await fixtures.course(programId, 'CSW01');
    const st = await fixtures.student(), classmate = await fixtures.student();
    await fixtures.enroll(st, courseW, semesterId);
    await fixtures.enroll(classmate, courseW, semesterId);

    const sA = (await createSession(courseW, '2026-10-01')).body.id;
    const sB = (await createSession(courseW, '2026-10-02')).body.id;
    const sC = (await createSession(courseW, '2026-10-03')).body.id;
    const sD = (await createSession(courseW, '2026-10-05')).body.id;
    await createSession(courseW, '2026-10-06'); // no register taken: must not count
    await record(sA, [{ studentId: st, status: 'present' }]);
    await record(sB, [{ studentId: st, status: 'late' }]);
    await record(sC, [{ studentId: st, status: 'absent' }]);
    // A register taken WITHOUT this student on it counts as not present for them.
    await record(sD, [{ studentId: classmate, status: 'present' }]);

    // 4 sessions with a register; present at 1 -> 25%.
    expect(await summary(st)).toEqual({ totalSessions: 4, presentSessions: 1, lateSessions: 1, percentage: 25 });
  });

  test('DROPPED courses are excluded from the percentage', async () => {
    const st = await fixtures.student();
    await fixtures.enroll(st, courseY, semesterId);
    const programId = await fixtures.program();
    const courseZ = await fixtures.course(programId, 'CSZ01');
    await fixtures.enroll(st, courseZ, semesterId);

    // Course Y: 2 sessions, present at both. Course Z: 2 sessions, absent at both.
    for (const d of ['2026-11-02', '2026-11-03']) {
      const id = (await createSession(courseY, d)).body.id;
      await record(id, [{ studentId: st, status: 'present' }]);
    }
    for (const d of ['2026-11-02', '2026-11-03']) {
      const id = (await createSession(courseZ, d)).body.id;
      await record(id, [{ studentId: st, status: 'absent' }]);
    }
    expect(await summary(st)).toMatchObject({ totalSessions: 4, presentSessions: 2, percentage: 50 });

    // The student drops course Z (there's no drop endpoint yet, so update the row directly).
    await fixtures.query('UPDATE enrollments SET status = ? WHERE student_id = ? AND course_id = ?', ['dropped', st, courseZ]);
    expect(await summary(st)).toMatchObject({ totalSessions: 2, presentSessions: 2, percentage: 100 });
  });

  test('a student with no taken sessions has percentage null, not 0', async () => {
    const st = await fixtures.student();
    expect(await summary(st)).toEqual({ totalSessions: 0, presentSessions: 0, lateSessions: 0, percentage: null });
  });
});
