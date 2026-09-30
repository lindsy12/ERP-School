const request = require('supertest');

jest.mock('../src/models/user.model');
jest.mock('../src/models/refreshToken.model');
const userModel = require('../src/models/user.model');
const refreshTokenModel = require('../src/models/refreshToken.model');

const app = require('../src/app');
const { verifyPassword } = require('../src/utils/password');
const { fakeUserTable, accessTokenFor, PASSWORD } = require('./fakeUserTable');

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_TENANT_ID = '22222222-2222-2222-2222-222222222222';
const NEW_PASSWORD = 'Brand-New-Pass-2';
let table;
let superAdmin;
let admin;

beforeEach(async () => {
  jest.resetAllMocks();
  table = fakeUserTable(userModel);
  refreshTokenModel.startFamily.mockResolvedValue();
  superAdmin = await table.add({ role: 'SUPER_ADMIN', tenantId: TENANT_ID });
  admin = await table.add({ role: 'ADMIN', tenantId: TENANT_ID });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

const as = (caller) => ({
  post: (path, body) => request(app).post(path).set('Authorization', `Bearer ${accessTokenFor(caller)}`).send(body),
  patch: (path, body) => request(app).patch(path).set('Authorization', `Bearer ${accessTokenFor(caller)}`).send(body),
  get: (path) => request(app).get(path).set('Authorization', `Bearer ${accessTokenFor(caller)}`),
});
const login = (email, password) =>
  request(app).post('/api/v1/auth/login').send({ tenant_id: TENANT_ID, email, password });
const lastLog = () => JSON.parse(console.log.mock.calls.at(-1)[0]);

describe('POST /api/v1/auth/users', () => {
  it('an ADMIN creates a STUDENT in their own school, who can then log in', async () => {
    const res = await as(admin).post('/api/v1/auth/users', {
      email: ' New.Student@School.test ',
      password: PASSWORD,
      role: 'STUDENT',
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      tenant_id: TENANT_ID,
      email: 'new.student@school.test',
      role: 'STUDENT',
      is_active: true,
      locked_until: null,
      created_at: expect.any(String),
    });
    expect(res.headers.location).toBe(`/api/v1/auth/users/${res.body.id}`);

    const saved = table.rows.get(res.body.id);
    expect(saved.password_hash).not.toContain(PASSWORD);
    await expect(verifyPassword(PASSWORD, saved.password_hash)).resolves.toBe(true);
    expect(lastLog()).toMatchObject({ event: 'auth.user.created', userId: res.body.id, createdBy: admin.id });

    expect((await login('new.student@school.test', PASSWORD)).status).toBe(200);
  });

  it('a SUPER_ADMIN can create an ADMIN', async () => {
    const res = await as(superAdmin).post('/api/v1/auth/users', { email: 'a2@school.test', password: PASSWORD, role: 'ADMIN' });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('ADMIN');
  });

  it.each([
    ['ADMIN', 'ADMIN'],
    ['ADMIN', 'SUPER_ADMIN'],
    ['SUPER_ADMIN', 'SUPER_ADMIN'],
    ['STAFF', 'STUDENT'],
    ['STUDENT', 'STUDENT'],
  ])('403 when a %s tries to create a %s', async (callerRole, role) => {
    const caller = await table.add({ role: callerRole, tenantId: TENANT_ID });

    const res = await as(caller).post('/api/v1/auth/users', { email: 'x@school.test', password: PASSWORD, role });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(userModel.create).not.toHaveBeenCalled();
  });

  it('409 EMAIL_TAKEN for an email already used in the same school, but not in another school', async () => {
    const other = await table.add({ role: 'ADMIN', tenantId: OTHER_TENANT_ID });
    const body = { email: admin.email, password: PASSWORD, role: 'STAFF' };

    const same = await as(admin).post('/api/v1/auth/users', body);
    const otherSchool = await as(other).post('/api/v1/auth/users', body);

    expect(same.status).toBe(409);
    expect(same.body.error.code).toBe('EMAIL_TAKEN');
    expect(otherSchool.status).toBe(201);
    expect(otherSchool.body.tenant_id).toBe(OTHER_TENANT_ID);
  });

  it('lists every invalid field, including ones that are not allowed', async () => {
    const res = await as(admin).post('/api/v1/auth/users', {
      email: 'nope',
      password: 'short',
      role: 'TEACHER',
      tenant_id: OTHER_TENANT_ID,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { field: 'tenant_id', message: 'is not allowed' },
      { field: 'email', message: 'must be a valid email address' },
      { field: 'password', message: 'must be at least 8 characters' },
      { field: 'role', message: 'must be one of SUPER_ADMIN, ADMIN, STAFF, STUDENT' },
    ]);
  });

  it('401 without an access token', async () => {
    const res = await request(app).post('/api/v1/auth/users').send({});

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/auth/users', () => {
  beforeEach(async () => {
    for (let i = 0; i < 3; i += 1) await table.add({ role: 'STUDENT', tenantId: TENANT_ID });
    await table.add({ role: 'STAFF', tenantId: TENANT_ID });
    await table.add({ role: 'STUDENT', tenantId: OTHER_TENANT_ID });
  });

  it("lists only the caller's school, newest first, without secrets", async () => {
    const res = await as(admin).get('/api/v1/auth/users');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 20, total: 6 });
    expect(res.body.data).toHaveLength(6);
    expect(res.body.data.every((u) => u.tenant_id === TENANT_ID)).toBe(true);
    expect(res.body.data[0].role).toBe('STAFF'); // added last
    expect(JSON.stringify(res.body)).not.toContain('password');
    expect(Object.keys(res.body.data[0]).sort()).toEqual(
      ['created_at', 'email', 'id', 'is_active', 'locked_until', 'role', 'tenant_id'],
    );
  });

  it('filters by role and pages', async () => {
    const res = await as(admin).get('/api/v1/auth/users?role=STUDENT&page=2&limit=2');

    expect(res.body).toMatchObject({ page: 2, limit: 2, total: 3 });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].role).toBe('STUDENT');
  });

  it('400 for a bad page size or role', async () => {
    const res = await as(admin).get('/api/v1/auth/users?limit=500&page=0&role=boss');

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field)).toEqual(['page', 'limit', 'role']);
  });

  it('403 for STAFF', async () => {
    const staff = await table.add({ role: 'STAFF', tenantId: TENANT_ID });

    expect((await as(staff).get('/api/v1/auth/users')).status).toBe(403);
  });
});

describe('GET /api/v1/auth/users/:id', () => {
  it('returns a user of the same school, and 404 for one of another school', async () => {
    const mine = await table.add({ role: 'STUDENT', tenantId: TENANT_ID });
    const theirs = await table.add({ role: 'STUDENT', tenantId: OTHER_TENANT_ID });

    const found = await as(admin).get(`/api/v1/auth/users/${mine.id}`);
    const hidden = await as(admin).get(`/api/v1/auth/users/${theirs.id}`);

    expect(found.status).toBe(200);
    expect(found.body.id).toBe(mine.id);
    expect(hidden.status).toBe(404);
    expect(hidden.body.error.code).toBe('NOT_FOUND');
  });

  it('shows locked_until only while the lock is running', async () => {
    const locked = await table.add({ role: 'STUDENT', tenantId: TENANT_ID });
    const until = new Date(Date.now() + 60_000);
    locked.locked_until = until;

    expect((await as(admin).get(`/api/v1/auth/users/${locked.id}`)).body.locked_until).toBe(until.toISOString());

    locked.locked_until = new Date(Date.now() - 1000);
    expect((await as(admin).get(`/api/v1/auth/users/${locked.id}`)).body.locked_until).toBeNull();
  });
});

describe('PATCH /api/v1/auth/users/:id', () => {
  it('disabling a user ends their sessions and rejects their access token at once', async () => {
    const student = await table.add({ role: 'STUDENT', tenantId: TENANT_ID });
    const studentToken = accessTokenFor(student);

    const res = await as(admin).patch(`/api/v1/auth/users/${student.id}`, { is_active: false });

    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(false);
    expect(table.sessionsEndedFor).toEqual([student.id]);
    const verify = await request(app).get('/api/v1/auth/verify').set('Authorization', `Bearer ${studentToken}`);
    expect(verify.status).toBe(401);
    expect(verify.body.error.code).toBe('UNAUTHORIZED');
    expect(lastLog()).toMatchObject({ event: 'auth.user.updated', changes: { is_active: false }, updatedBy: admin.id });
  });

  it('a role change is seen by the next /verify, without waiting for a new token', async () => {
    const staff = await table.add({ role: 'STAFF', tenantId: TENANT_ID });
    const staffToken = accessTokenFor(staff); // says STAFF

    await as(admin).patch(`/api/v1/auth/users/${staff.id}`, { role: 'STUDENT' });

    const verify = await request(app).get('/api/v1/auth/verify').set('Authorization', `Bearer ${staffToken}`);
    expect(verify.body.role).toBe('STUDENT');
    expect(table.sessionsEndedFor).toEqual([]); // a role change alone keeps the user logged in
  });

  it('403 when an ADMIN promotes someone to ADMIN, edits another ADMIN, or edits themselves', async () => {
    const staff = await table.add({ role: 'STAFF', tenantId: TENANT_ID });
    const otherAdmin = await table.add({ role: 'ADMIN', tenantId: TENANT_ID });

    const promote = await as(admin).patch(`/api/v1/auth/users/${staff.id}`, { role: 'ADMIN' });
    const peer = await as(admin).patch(`/api/v1/auth/users/${otherAdmin.id}`, { is_active: false });
    const self = await as(admin).patch(`/api/v1/auth/users/${admin.id}`, { is_active: false });

    for (const res of [promote, peer, self]) expect(res.status).toBe(403);
    expect(userModel.update).not.toHaveBeenCalled();
  });

  it('a SUPER_ADMIN can disable an ADMIN', async () => {
    const res = await as(superAdmin).patch(`/api/v1/auth/users/${admin.id}`, { is_active: false });

    expect(res.status).toBe(200);
  });

  it('400 for an empty body, a wrong type, or a field that cannot be changed here', async () => {
    const student = await table.add({ role: 'STUDENT', tenantId: TENANT_ID });
    const path = `/api/v1/auth/users/${student.id}`;

    expect((await as(admin).patch(path, {})).body.error.details).toEqual([
      { field: 'role', message: 'role or is_active is required' },
    ]);
    expect((await as(admin).patch(path, { is_active: 'no' })).body.error.details).toEqual([
      { field: 'is_active', message: 'must be true or false' },
    ]);
    expect((await as(admin).patch(path, { password: NEW_PASSWORD })).status).toBe(400);
  });
});

describe('POST /api/v1/auth/users/:id/reset-password', () => {
  it('sets the new password, clears the lock, ends sessions and rejects older access tokens', async () => {
    const staff = await table.add({ role: 'STAFF', tenantId: TENANT_ID });
    staff.failed_login_attempts = 5;
    staff.locked_until = new Date(Date.now() + 60_000);
    const oldToken = accessTokenFor(staff, { issuedSecondsAgo: 5 });

    const res = await as(admin).post(`/api/v1/auth/users/${staff.id}/reset-password`, { new_password: NEW_PASSWORD });

    expect(res.status).toBe(204);
    expect(table.sessionsEndedFor).toEqual([staff.id]);
    expect(lastLog()).toMatchObject({ event: 'auth.password.reset', userId: staff.id, resetBy: admin.id });

    const verify = await request(app).get('/api/v1/auth/verify').set('Authorization', `Bearer ${oldToken}`);
    expect(verify.status).toBe(401);
    expect(verify.body.error).toEqual({ code: 'INVALID_TOKEN', message: 'Access token has been revoked' });

    expect((await login(staff.email, PASSWORD)).status).toBe(401);
    expect((await login(staff.email, NEW_PASSWORD)).status).toBe(200);
  });

  it('403 for a user the admin does not outrank', async () => {
    const res = await as(admin).post(`/api/v1/auth/users/${superAdmin.id}/reset-password`, { new_password: NEW_PASSWORD });

    expect(res.status).toBe(403);
    expect(userModel.setPassword).not.toHaveBeenCalled();
  });

  it('400 for a password that is too short', async () => {
    const staff = await table.add({ role: 'STAFF', tenantId: TENANT_ID });

    const res = await as(admin).post(`/api/v1/auth/users/${staff.id}/reset-password`, { new_password: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ field: 'new_password', message: 'must be at least 8 characters' }]);
  });
});

describe('POST /api/v1/auth/users/:id/unlock', () => {
  it('an ADMIN cannot unlock another ADMIN; a SUPER_ADMIN can', async () => {
    const lockedAdmin = await table.add({ role: 'ADMIN', tenantId: TENANT_ID });
    lockedAdmin.locked_until = new Date(Date.now() + 60_000);

    expect((await as(admin).post(`/api/v1/auth/users/${lockedAdmin.id}/unlock`)).status).toBe(403);
    expect((await as(superAdmin).post(`/api/v1/auth/users/${lockedAdmin.id}/unlock`)).status).toBe(204);
    expect(lockedAdmin.locked_until).toBeNull();
  });
});
