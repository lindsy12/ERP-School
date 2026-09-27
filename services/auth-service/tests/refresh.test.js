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
const PASSWORD = 'Correct-Password-1';
const sha256 = (token) => crypto.createHash('sha256').update(token).digest('hex');
let user;

// In-memory stand-in for the token_families and refresh_tokens tables. withTransaction restores
// a snapshot if the work throws, like a real rollback.
let db;
function fakeTokenTables() {
  db = { families: new Map(), tokens: new Map() };

  refreshTokenModel.startFamily.mockImplementation(async ({ familyId, userId, tokenId, tokenHash, expiresAt }) => {
    db.families.set(familyId, { id: familyId, user_id: userId, revoked_at: null });
    db.tokens.set(tokenId, {
      id: tokenId, family_id: familyId, token_hash: tokenHash, expires_at: expiresAt, revoked_at: null, replaced_by: null,
    });
  });

  const queries = {
    async findByHashForUpdate(tokenHash) {
      const token = [...db.tokens.values()].find((t) => t.token_hash === tokenHash);
      if (!token) return null;
      const family = db.families.get(token.family_id);
      return { ...token, user_id: family.user_id, family_revoked_at: family.revoked_at };
    },
    async revokeFamily(familyId, now = new Date()) {
      const family = db.families.get(familyId);
      family.revoked_at ??= now;
      for (const t of db.tokens.values()) if (t.family_id === familyId) t.revoked_at ??= now;
    },
    async rotate({ oldTokenId, familyId, newTokenId, newTokenHash, newExpiresAt, now = new Date() }) {
      db.tokens.set(newTokenId, {
        id: newTokenId, family_id: familyId, token_hash: newTokenHash, expires_at: newExpiresAt, revoked_at: null, replaced_by: null,
      });
      Object.assign(db.tokens.get(oldTokenId), { revoked_at: now, replaced_by: newTokenId });
    },
  };

  refreshTokenModel.withTransaction.mockImplementation(async (work) => {
    const snapshot = structuredClone(db);
    try {
      return await work(queries);
    } catch (err) {
      db = snapshot;
      throw err;
    }
  });
}

const tokenByRaw = (raw) => [...db.tokens.values()].find((t) => t.token_hash === sha256(raw));

beforeAll(async () => {
  user = {
    id: crypto.randomUUID(),
    tenant_id: TENANT_ID,
    email: 'admin@school.test',
    password_hash: await hashPassword(PASSWORD),
    is_active: 1,
    role: 'ADMIN',
  };
});

beforeEach(() => {
  jest.resetAllMocks();
  userModel.findByTenantAndEmail.mockImplementation(async (tenantId, email) =>
    tenantId === user.tenant_id && email === user.email ? user : null,
  );
  userModel.findById.mockImplementation(async (id) => {
    if (id !== user.id) return null;
    const { password_hash: _omit, ...withoutHash } = user;
    return withoutHash;
  });
  fakeTokenTables();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

const login = async () =>
  (await request(app).post('/api/v1/auth/login').send({ tenant_id: TENANT_ID, email: user.email, password: PASSWORD })).body;
const refresh = (refreshToken) => request(app).post('/api/v1/auth/refresh').send({ refresh_token: refreshToken });
const logout = (accessToken, refreshToken) =>
  request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${accessToken}`).send({ refresh_token: refreshToken });

const expectRejected = (res) => {
  expect(res.status).toBe(401);
  expect(res.body).toEqual({
    error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid or expired' },
  });
};

describe('POST /api/v1/auth/refresh', () => {
  it('rotates a valid token: new pair returned, old token revoked and linked to the new one', async () => {
    const first = await login();

    const res = await refresh(first.refresh_token);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      token_type: 'Bearer',
      expires_in: 900,
    });
    expect(res.body.refresh_token).not.toBe(first.refresh_token);

    const claims = jwt.verify(res.body.access_token, 'test-secret', { algorithms: ['HS256'] });
    expect(claims).toMatchObject({ sub: user.id, role: 'ADMIN', tenant_id: TENANT_ID });

    const oldRow = tokenByRaw(first.refresh_token);
    const newRow = tokenByRaw(res.body.refresh_token);
    expect(newRow.family_id).toBe(oldRow.family_id); // same session
    expect(oldRow.revoked_at).toBeInstanceOf(Date);
    expect(oldRow.replaced_by).toBe(newRow.id);
    expect(newRow.revoked_at).toBeNull();

    // The new token works in turn.
    expect((await refresh(res.body.refresh_token)).status).toBe(200);
  });

  it('401 for an expired token, without revoking the family', async () => {
    const { refresh_token: token } = await login();
    tokenByRaw(token).expires_at = new Date(Date.now() - 1000);

    expectRejected(await refresh(token));

    expect([...db.families.values()][0].revoked_at).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('401 for an unknown token', async () => {
    expectRejected(await refresh('never-issued'));
  });

  it('reuse of a rotated token revokes the whole family and logs a warning', async () => {
    const { refresh_token: stolen } = await login();
    const { body: rotated } = await refresh(stolen); // the real user rotates first

    expectRejected(await refresh(stolen)); // the copy comes back: reuse

    const family = [...db.families.values()][0];
    expect(family.revoked_at).toBeInstanceOf(Date);
    for (const t of db.tokens.values()) expect(t.revoked_at).toBeInstanceOf(Date);

    // The newest token in the family is dead too, whoever holds it.
    expectRejected(await refresh(rotated.refresh_token));

    expect(console.warn).toHaveBeenCalledTimes(1); // only for the reuse, not the later attempt
    const log = JSON.parse(console.warn.mock.calls[0][0]);
    expect(log).toMatchObject({ level: 'warn', event: 'auth.refresh_token.reuse_detected', userId: user.id, familyId: family.id });
    expect(console.warn.mock.calls[0][0]).not.toContain(stolen);
  });

  it('does not touch other sessions of the same user when one family is revoked', async () => {
    const phone = await login();
    const laptop = await login();
    await refresh(phone.refresh_token);
    await refresh(phone.refresh_token); // reuse on the phone session

    expect((await refresh(laptop.refresh_token)).status).toBe(200);
  });

  it('401 for a disabled user, without rotating', async () => {
    const { refresh_token: token } = await login();
    user.is_active = 0;
    try {
      expectRejected(await refresh(token));
      expect(tokenByRaw(token).revoked_at).toBeNull();
    } finally {
      user.is_active = 1;
    }
  });

  it('400 when refresh_token is missing', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({});

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ field: 'refresh_token', message: 'is required' }]);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('revokes the family, so the refresh token no longer works', async () => {
    const tokens = await login();

    const res = await logout(tokens.access_token, tokens.refresh_token);

    expect(res.status).toBe(204);
    expectRejected(await refresh(tokens.refresh_token));
    expect(console.warn).not.toHaveBeenCalled(); // a logged-out token is not reported as theft
  });

  it('also kills tokens rotated earlier in the same session', async () => {
    const first = await login();
    const { body: second } = await refresh(first.refresh_token);

    expect((await logout(second.access_token, second.refresh_token)).status).toBe(204);

    expectRejected(await refresh(second.refresh_token));
  });

  it('is safe to repeat', async () => {
    const tokens = await login();
    await logout(tokens.access_token, tokens.refresh_token);

    expect((await logout(tokens.access_token, tokens.refresh_token)).status).toBe(204);
  });

  it('requires an access token', async () => {
    const tokens = await login();

    const res = await request(app).post('/api/v1/auth/logout').send({ refresh_token: tokens.refresh_token });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect((await refresh(tokens.refresh_token)).status).toBe(200);
  });

  it("cannot end another user's session", async () => {
    const victim = await login();
    const otherUserToken = jwt.sign({ role: 'STUDENT', tenant_id: TENANT_ID }, 'test-secret', {
      algorithm: 'HS256',
      subject: crypto.randomUUID(),
      expiresIn: 60,
    });

    expectRejected(await logout(otherUserToken, victim.refresh_token));
    expect((await refresh(victim.refresh_token)).status).toBe(200);
  });
});
