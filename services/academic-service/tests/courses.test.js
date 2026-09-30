const request = require('supertest');
const app = require('../src/app');
const { setupTestDb, teardownTestDb, fixtures } = require('./helpers/testDb');

// Courses & programs: creation, uniqueness, prerequisite integrity, and the create transaction.

beforeAll(setupTestDb);
afterAll(teardownTestDb);

describe('programs', () => {
  test('creates a program (201) and rejects a duplicate name (409)', async () => {
    const created = await request(app).post('/api/v1/programs').send({ name: 'BSc Computer Science', description: '4 years' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ id: expect.any(Number), name: 'BSc Computer Science', description: '4 years' });

    const dup = await request(app).post('/api/v1/programs').send({ name: 'BSc Computer Science' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatch(/already exists/);
  });

  test('rejects a missing name with 400 before touching the database', async () => {
    const res = await request(app).post('/api/v1/programs').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name is required/);
  });
});

describe('courses', () => {
  let programId, cs101, cs102;

  beforeAll(async () => {
    programId = await fixtures.program('Courses test program');
    cs101 = (await request(app).post('/api/v1/courses').send({ program_id: programId, code: 'CS101', title: 'Intro', credit_hours: 3 })).body;
    cs102 = (await request(app).post('/api/v1/courses').send({ program_id: programId, code: 'CS102', title: 'Discrete Math', credit_hours: 4 })).body;
  });

  test('creates a course with prerequisites and returns them resolved (201)', async () => {
    const res = await request(app).post('/api/v1/courses')
      .send({ program_id: programId, code: 'CS201', title: 'Data Structures', credit_hours: 4, prerequisite_ids: [cs101.id, cs102.id, cs102.id] });
    expect(res.status).toBe(201);
    // Duplicate ids in the request are collapsed; prerequisites come back as full course rows.
    expect(res.body.prerequisites.map(p => p.code).sort()).toEqual(['CS101', 'CS102']);
  });

  test('rejects a duplicate course code with 409', async () => {
    const res = await request(app).post('/api/v1/courses').send({ program_id: programId, code: 'CS101', title: 'Again', credit_hours: 3 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/CS101.*already exists/);
  });

  test('validates input: missing fields, unknown program, unknown prerequisite', async () => {
    const missing = await request(app).post('/api/v1/courses').send({ program_id: programId, title: 'x' });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe('Missing required field(s): code, credit_hours');

    const noProgram = await request(app).post('/api/v1/courses').send({ program_id: 999999, code: 'X1', title: 'x', credit_hours: 3 });
    expect(noProgram.status).toBe(400);
    expect(noProgram.body.error).toMatch(/program_id 999999 does not exist/);

    const badPrereq = await request(app).post('/api/v1/courses')
      .send({ program_id: programId, code: 'X2', title: 'x', credit_hours: 3, prerequisite_ids: [cs101.id, 999999] });
    expect(badPrereq.status).toBe(400);
    expect(badPrereq.body.error).toMatch(/999999/);
  });

  test('a course cannot be its own prerequisite', async () => {
    const res = await request(app).put(`/api/v1/courses/${cs101.id}`)
      .send({ program_id: programId, code: 'CS101', title: 'Intro', credit_hours: 3, prerequisite_ids: [cs101.id] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/own prerequisite/);
  });

  test('deleting a course that another course requires is blocked (409); it succeeds once unreferenced', async () => {
    const dependent = (await request(app).post('/api/v1/courses')
      .send({ program_id: programId, code: 'CS301', title: 'Databases', credit_hours: 4, prerequisite_ids: [cs102.id] })).body;

    const blocked = await request(app).delete(`/api/v1/courses/${cs102.id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/prerequisite for other courses/);
    expect((await request(app).get(`/api/v1/courses/${cs102.id}`)).status).toBe(200); // still there

    // Deleting the dependent course also removes its own prerequisite links (ON DELETE CASCADE)...
    expect((await request(app).delete(`/api/v1/courses/${dependent.id}`)).status).toBe(204);
    // ...but CS102 is still required by CS201, so it stays blocked.
    expect((await request(app).delete(`/api/v1/courses/${cs102.id}`)).status).toBe(409);
  });

  test('PUT without prerequisite_ids keeps the existing prerequisites', async () => {
    const course = (await request(app).post('/api/v1/courses')
      .send({ program_id: programId, code: 'CS210', title: 'Old title', credit_hours: 3, prerequisite_ids: [cs101.id] })).body;
    const res = await request(app).put(`/api/v1/courses/${course.id}`)
      .send({ program_id: programId, code: 'CS210', title: 'New title', credit_hours: 3 });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('New title');
    expect(res.body.prerequisites.map(p => p.code)).toEqual(['CS101']);
  });

  test('transaction rollback: if linking a prerequisite fails, the course itself is not saved', async () => {
    // Make every prerequisite insert fail inside the create-course transaction.
    await fixtures.query(`CREATE TRIGGER test_fail_prereq BEFORE INSERT ON course_prerequisites FOR EACH ROW
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'simulated failure while linking prerequisites'`);
    try {
      const res = await request(app).post('/api/v1/courses')
        .send({ program_id: programId, code: 'CS999', title: 'Rolled back', credit_hours: 3, prerequisite_ids: [cs101.id] });
      expect(res.status).toBe(500);
      const rows = await fixtures.query('SELECT id FROM courses WHERE code = ?', ['CS999']);
      expect(rows).toHaveLength(0); // the course INSERT was rolled back with the failed link
    } finally {
      await fixtures.query('DROP TRIGGER test_fail_prereq');
    }
  });
});
