const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');

jest.mock('../src/models/user.model');
jest.mock('../src/models/refreshToken.model');
const userModel = require('../src/models/user.model');
const refreshTokenModel = require('../src/models/refreshToken.model');

const app = require('../src/app');
const { hashPassword } = require('../src/utils/password');

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_TENANT_ID = '22222222-2222-2222-2222-222222222222';
const PASSWORD = 'Correct-Password-1';
const LOCKOUT_MS = 15 * 60 * 1000;
let row; // stands in for the user's row in the users table
let callers; // other users who send requests (the admins in the unlock tests), by id

beforeAll(async () => {
  row = {
    id: crypto.randomUUID(),
    tenant_id: TENANT_ID,
    email: 'teacher@school.test',
    password_hash: await hashPassword(PASSWORD),
    is_active: 1,
    role: 'STAFF',
  };
});

beforeEach(() => {
  jest.resetAllMocks();
  Object.assign(row, { failed_login_attempts: 0, locked_until: null });
  callers = new Map();

  // Each query returns a copy, like a real database read.
  userModel.findByTenantAndEmail.mockImplementation(async (tenantId, email) =>
    tenantId === row.tenant_id && email === row.email ? { ...row } : null,
  );
  userModel.findById.mockImplementation(async (id) => {
    if (callers.has(id)) return callers.get(id);
    if (id !== row.id) return null;
    const { password_hash: _omit, ...withoutHash } = row;
    return withoutHash;
  });
  userModel.recordFailedLogin.mockImplementation(async (id, computeNext) => {
    const next = computeNext({ failed_login_attempts: row.failed_login_attempts, locked_until: row.locked_until });
    Object.assign(row, { failed_login_attempts: next.failedAttempts, locked_until: next.lockedUntil });
    return next;
  });
  userModel.resetFailedLogins.mockImplementation(async () => {
    Object.assign(row, { failed_login_attempts: 0, locked_until: null });
  });
  refreshTokenModel.startFamily.mockResolvedValue();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const login = (password) =>
  request(app).post('/api/v1/auth/login').send({ tenant_id: TENANT_ID, email: row.email, password });

async function failTimes(n) {
  const responses = [];
  for (let i = 0; i < n; i += 1) responses.push(await login('wrong-password'));
  return responses;
}

const expectLocked = (res) => {
  expect(res.status).toBe(423);
  expect(res.body).toEqual({ error: { code: 'ACCOUNT_LOCKED', message: 'Account temporarily locked' } });
};

// Moves only Date forward; real timers stay, so bcrypt and supertest still run normally.
function freezeClock() {
  jest.useFakeTimers({
    now: Date.now(),
    doNotFake: [
      'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'setImmediate', 'clearImmediate',
      'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
    ],
  });
}

describe('account lockout on POST /api/v1/auth/login', () => {
  it('the 5th wrong password locks the account for 15 minutes and logs it once', async () => {
    const firstFour = await failTimes(4);
    for (const res of firstFour) expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(row.failed_login_attempts).toBe(4);
    expect(row.locked_until).toBeNull();

    const before = Date.now();
    expectLocked(await login('wrong-password'));

    expect(row.failed_login_attempts).toBe(5);
    expect(row.locked_until.getTime() - before).toBeGreaterThanOrEqual(LOCKOUT_MS - 1000);
    expect(row.locked_until.getTime() - before).toBeLessThanOrEqual(LOCKOUT_MS + 1000);

    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(console.warn.mock.calls[0][0])).toMatchObject({
      level: 'warn',
      event: 'auth.account.locked',
      userId: row.id,
      tenantId: TENANT_ID,
      failedAttempts: 5,
      lockedUntil: row.locked_until.toISOString(),
    });
  });

  it('rejects a locked account even with the right password, before checking it', async () => {
    await failTimes(5);
    refreshTokenModel.startFamily.mockClear();
    userModel.recordFailedLogin.mockClear();

    expectLocked(await login(PASSWORD));
    expectLocked(await login('wrong-password'));

    expect(refreshTokenModel.startFamily).not.toHaveBeenCalled(); // no session was created
    expect(userModel.recordFailedLogin).not.toHaveBeenCalled(); // guesses while locked aren't even counted
    expect(row.failed_login_attempts).toBe(5);
  });

  it('lets the user in once the lock has expired, and resets the counter', async () => {
    freezeClock();
    await failTimes(5);

    jest.setSystemTime(Date.now() + LOCKOUT_MS - 1000);
    expectLocked(await login(PASSWORD)); // one second left

    jest.setSystemTime(Date.now() + 2000);
    const res = await login(PASSWORD);

    expect(res.status).toBe(200);
    expect(res.body.access_token).toEqual(expect.any(String));
    expect(row).toMatchObject({ failed_login_attempts: 0, locked_until: null });
  });

  it('after a lock expires, a wrong password starts a new count instead of locking again', async () => {
    freezeClock();
    await failTimes(5);
    jest.setSystemTime(Date.now() + LOCKOUT_MS + 1000);

    const res = await login('wrong-password');

    expect(res.status).toBe(401);
    expect(row).toMatchObject({ failed_login_attempts: 1, locked_until: null });
  });

  it('a successful login resets the counter, so the user gets a full 5 attempts again', async () => {
    await failTimes(4);

    expect((await login(PASSWORD)).status).toBe(200);
    expect(row).toMatchObject({ failed_login_attempts: 0, locked_until: null });

    const again = await failTimes(4);
    for (const r of again) expect(r.status).toBe(401);
    expect(row.locked_until).toBeNull();
  });

  it('does not write to the database on a normal login with no earlier failures', async () => {
    expect((await login(PASSWORD)).status).toBe(200);

    expect(userModel.resetFailedLogins).not.toHaveBeenCalled();
  });

  it('never counts attempts against unknown emails', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ tenant_id: TENANT_ID, email: 'nobody@school.test', password: 'x' });

    expect(res.status).toBe(401);
    expect(userModel.recordFailedLogin).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/auth/users/:id/unlock', () => {
  // An access token for a new, active user with this role and school.
  const tokenFor = (role, tenantId = TENANT_ID) => {
    const caller = { id: crypto.randomUUID(), tenant_id: tenantId, email: `${role}@school.test`, is_active: 1, role };
    callers.set(caller.id, caller);
    return jwt.sign({ role, tenant_id: tenantId }, 'test-secret', {
      algorithm: 'HS256',
      subject: caller.id,
      expiresIn: 60,
    });
  };
  const unlock = (token, id = row.id) => {
    const req = request(app).post(`/api/v1/auth/users/${id}/unlock`);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  beforeEach(() => failTimes(5));

  it.each(['ADMIN', 'SUPER_ADMIN'])('%s can unlock a user of their school, who can then log in', async (role) => {
    const res = await unlock(tokenFor(role));

    expect(res.status).toBe(204);
    expect(row).toMatchObject({ failed_login_attempts: 0, locked_until: null });
    expect(JSON.parse(console.log.mock.calls.at(-1)[0])).toMatchObject({
      event: 'auth.account.unlocked',
      userId: row.id,
    });
    expect((await login(PASSWORD)).status).toBe(200);
  });

  it.each(['STUDENT', 'STAFF'])('403 for a %s, and the account stays locked', async (role) => {
    const res = await unlock(tokenFor(role));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(userModel.resetFailedLogins).not.toHaveBeenCalled();
    expectLocked(await login(PASSWORD));
  });

  it('401 without an access token', async () => {
    expect((await unlock()).status).toBe(401);
  });

  it("404 for an admin of another school, same as a user that doesn't exist", async () => {
    const otherSchool = await unlock(tokenFor('ADMIN', OTHER_TENANT_ID));
    const missing = await unlock(tokenFor('ADMIN'), crypto.randomUUID());

    expect(otherSchool.status).toBe(404);
    expect(otherSchool.body).toEqual(missing.body);
    expect(userModel.resetFailedLogins).not.toHaveBeenCalled();
  });

  it('400 for an id that is not a UUID', async () => {
    const res = await unlock(tokenFor('ADMIN'), 'not-a-uuid');

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ field: 'id', message: 'must be a UUID' }]);
  });
});
