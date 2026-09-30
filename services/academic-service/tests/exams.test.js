const request = require('supertest');
const app = require('../src/app');
const { setupTestDb, teardownTestDb, fixtures } = require('./helpers/testDb');

// Exam scheduling. Conflict rule: same room + same date + overlapping [start, end) ranges,
// where [s1, e1) overlaps [s2, e2) iff s1 < e2 AND s2 < e1. Back-to-back is NOT a conflict.

let fall, cs101, cs102, cs103;

beforeAll(async () => {
  await setupTestDb();
  const programId = await fixtures.program();
  cs101 = await fixtures.course(programId, 'CS101');
  cs102 = await fixtures.course(programId, 'CS102');
  cs103 = await fixtures.course(programId, 'CS103');
  fall = await fixtures.semester('Fall 2026', '2026-09-01', '2026-12-20');
});
afterAll(teardownTestDb);

const book = (courseId, examDate, startTime, endTime, room, semesterId = fall) =>
  request(app).post('/api/v1/exams').send({ courseId, semesterId, examDate, startTime, endTime, room });

describe('overlap detection (existing exam: CS101 09:00-11:00 in Hall A on 2026-12-10)', () => {
  let base;
  beforeAll(async () => {
    const res = await book(cs101, '2026-12-10', '09:00', '11:00', 'Hall A');
    expect(res.status).toBe(201);
    base = res.body;
  });

  test.each([
    ['partial overlap at the end', '10:00', '12:00'],
    ['partial overlap at the start', '08:00', '09:30'],
    ['fully inside', '09:30', '10:30'],
    ['fully surrounding', '08:00', '13:00'],
    ['identical slot', '09:00', '11:00'],
    ['one minute overlap', '10:59', '12:00'],
  ])('%s (%s-%s) returns 409 with a conflicts array, and saves nothing', async (_label, start, end) => {
    const before = (await fixtures.query('SELECT COUNT(*) AS n FROM exams'))[0].n;
    const res = await book(cs102, '2026-12-10', start, end, 'Hall A');

    expect(res.status).toBe(409);
    expect(res.body.conflicts).toEqual([
      expect.objectContaining({ id: base.id, course_code: 'CS101', room: 'Hall A', start_time: '09:00:00', end_time: '11:00:00', exam_date: '2026-12-10' }),
    ]);
    expect(res.body.error).toMatch(/CS101 09:00-11:00/);
    expect((await fixtures.query('SELECT COUNT(*) AS n FROM exams'))[0].n).toBe(before);
  });

  test('room names match case-insensitively and ignore surrounding spaces', async () => {
    const res = await book(cs102, '2026-12-10', '10:00', '10:30', '  hall a ');
    expect(res.status).toBe(409);
    expect(res.body.conflicts.map(c => c.id)).toEqual([base.id]);
  });

  test('back-to-back exams with no gap succeed, on both sides', async () => {
    const after = await book(cs102, '2026-12-10', '11:00', '13:00', 'Hall A');
    expect(after.status).toBe(201);
    const before = await book(cs103, '2026-12-10', '07:00', '09:00', 'Hall A');
    expect(before.status).toBe(201);
  });

  test('a slot overlapping several exams lists every conflict', async () => {
    // Hall A now has 07-09, 09-11 and 11-13 on this date.
    const res = await book(cs103, '2026-12-10', '08:30', '11:30', 'Hall A');
    expect(res.status).toBe(409);
    expect(res.body.conflicts.map(c => `${c.start_time}-${c.end_time}`)).toEqual(['07:00:00-09:00:00', '09:00:00-11:00:00', '11:00:00-13:00:00']);
  });

  test('the same time in a different room, or on a different date, is fine', async () => {
    expect((await book(cs102, '2026-12-10', '09:00', '11:00', 'Hall B')).status).toBe(201);
    expect((await book(cs102, '2026-12-11', '09:00', '11:00', 'Hall A')).status).toBe(201);
  });
});

describe('updates', () => {
  test('PUT excludes the exam itself from the check, but still refuses a real conflict (exam left unchanged)', async () => {
    const a = (await book(cs101, '2026-12-14', '09:00', '11:00', 'Lab 1')).body;
    const b = (await book(cs102, '2026-12-14', '13:00', '15:00', 'Lab 1')).body;
    const body = (start, end) => ({ courseId: cs101, semesterId: fall, examDate: '2026-12-14', startTime: start, endTime: end, room: 'Lab 1' });

    // Shifting within its own slot is not a conflict with itself.
    const shifted = await request(app).put(`/api/v1/exams/${a.id}`).send(body('09:30', '11:00'));
    expect(shifted.status).toBe(200);
    expect(shifted.body.start_time).toBe('09:30:00');

    // Extending into B's slot is a conflict naming B.
    const clash = await request(app).put(`/api/v1/exams/${a.id}`).send(body('10:00', '14:00'));
    expect(clash.status).toBe(409);
    expect(clash.body.conflicts.map(c => c.id)).toEqual([b.id]);
    expect((await request(app).get(`/api/v1/exams/${a.id}`)).body).toMatchObject({ start_time: '09:30:00', end_time: '11:00:00' });
  });
});

describe('concurrency', () => {
  test('simultaneous overlapping bookings for one room: exactly one succeeds (per-room lock)', async () => {
    const slots = [['09:00', '11:00'], ['09:30', '10:30'], ['10:00', '12:00'], ['08:00', '09:30'], ['10:59', '12:00'], ['08:00', '13:00']];
    const results = await Promise.all(slots.map(([s, e]) => book(cs101, '2026-12-15', s, e, 'Hall C')));
    expect(results.filter(r => r.status === 201)).toHaveLength(1);
    expect(results.filter(r => r.status === 409)).toHaveLength(slots.length - 1);
    expect((await fixtures.query("SELECT COUNT(*) AS n FROM exams WHERE room = 'Hall C'"))[0].n).toBe(1);
    // No lock left held on the room.
    expect((await fixtures.query("SELECT IS_USED_LOCK('exam_room:hall c') AS holder"))[0].holder).toBeNull();
  });
});

describe('validation, filters and delete', () => {
  test('rejects end <= start and dates outside the semester (400)', async () => {
    expect((await book(cs101, '2026-12-16', '11:00', '09:00', 'Hall D')).status).toBe(400);
    expect((await book(cs101, '2026-12-16', '09:00', '09:00', 'Hall D')).status).toBe(400);
    const outside = await book(cs101, '2027-02-01', '09:00', '10:00', 'Hall D');
    expect(outside.status).toBe(400);
    expect(outside.body.error).toMatch(/outside Fall 2026/);
  });

  test('?courseId= and ?semesterId= filter the list; a malformed filter is a 400', async () => {
    const onlyCs103 = await request(app).get(`/api/v1/exams?courseId=${cs103}`);
    expect(onlyCs103.status).toBe(200);
    expect(onlyCs103.body.length).toBeGreaterThan(0);
    expect(onlyCs103.body.every(e => e.course_id === cs103)).toBe(true);

    const bySemester = await request(app).get(`/api/v1/exams?semesterId=${fall}&courseId=${cs103}`);
    expect(bySemester.body).toEqual(onlyCs103.body);

    expect((await request(app).get('/api/v1/exams?courseId=abc')).status).toBe(400);
  });

  test('deleting an exam frees its slot (204, then 404 on repeat)', async () => {
    const e = (await book(cs101, '2026-12-17', '09:00', '11:00', 'Hall E')).body;
    expect((await book(cs102, '2026-12-17', '10:00', '11:00', 'Hall E')).status).toBe(409);
    expect((await request(app).delete(`/api/v1/exams/${e.id}`)).status).toBe(204);
    expect((await request(app).delete(`/api/v1/exams/${e.id}`)).status).toBe(404);
    expect((await book(cs102, '2026-12-17', '10:00', '11:00', 'Hall E')).status).toBe(201);
  });
});
