const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');

// Replace the database queries with fakes, so these tests run without MySQL.
jest.mock('../src/models/user.model');
jest.mock('../src/models/refreshToken.model');
const userModel = require('../src/models/user.model');
const refreshTokenModel = require('../src/models/refreshToken.model');

const app = require('../src/app');
const { hashPassword } = require('../src/utils/password');

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const PASSWORD = 'Correct-Password-1';
let user;

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
  userModel.recordFailedLogin.mockImplementation(async (id, computeNext) =>
    computeNext({ failed_login_attempts: 0, locked_until: null }),
  );
  refreshTokenModel.startFamily.mockResolvedValue();
});

const login = (body) => request(app).post('/api/v1/auth/login').send(body);

describe('POST /api/v1/auth/login', () => {
  it('returns tokens with the required JWT claims', async () => {
    const res = await login({ tenant_id: TENANT_ID, email: ' Admin@School.test ', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      token_type: 'Bearer',
      expires_in: 900,
    });

    const claims = jwt.verify(res.body.access_token, 'test-secret', { algorithms: ['HS256'] });
    expect(claims).toMatchObject({ sub: user.id, role: 'ADMIN', tenant_id: TENANT_ID });
    expect(claims.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(claims.exp - claims.iat).toBe(15 * 60);
  });

  it('stores only a SHA-256 hash of the refresh token, in a new family', async () => {
    const res = await login({ tenant_id: TENANT_ID, email: user.email, password: PASSWORD });

    expect(refreshTokenModel.startFamily).toHaveBeenCalledTimes(1);
    const saved = refreshTokenModel.startFamily.mock.calls[0][0];
    const expectedHash = crypto.createHash('sha256').update(res.body.refresh_token).digest('hex');

    expect(saved.tokenHash).toBe(expectedHash);
    expect(JSON.stringify(saved)).not.toContain(res.body.refresh_token);
    expect(saved.userId).toBe(user.id);
    expect(saved.familyId).toMatch(/^[0-9a-f-]{36}$/);
    expect(saved.tokenId).toMatch(/^[0-9a-f-]{36}$/);
    expect(saved.tokenId).not.toBe(saved.familyId);

    const days = (saved.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeCloseTo(7, 1);
  });

  it('gives the same 401 for an unknown email and a wrong password', async () => {
    const unknownEmail = await login({ tenant_id: TENANT_ID, email: 'nobody@school.test', password: PASSWORD });
    const wrongPassword = await login({ tenant_id: TENANT_ID, email: user.email, password: 'wrong' });

    const expected = { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } };
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(expected);
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body).toEqual(expected);
    expect(refreshTokenModel.startFamily).not.toHaveBeenCalled();
  });

  it('gives the same 401 for a disabled account, even with the right password', async () => {
    user.is_active = 0;
    try {
      const res = await login({ tenant_id: TENANT_ID, email: user.email, password: PASSWORD });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    } finally {
      user.is_active = 1;
    }
  });

  it('lists every invalid field', async () => {
    const res = await login({ tenant_id: 'not-a-uuid', email: 'nope', password: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d) => d.field)).toEqual(['tenant_id', 'email', 'password']);
  });

  it('rejects wrong types and passwords over 72 bytes', async () => {
    const res = await login({ tenant_id: 123, email: ['a@b.co'], password: 'x'.repeat(73) });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { field: 'tenant_id', message: 'must be a UUID' },
      { field: 'email', message: 'must be a valid email address' },
      { field: 'password', message: 'must be at most 72 bytes' },
    ]);
  });

  it('rejects a body that is not a JSON object', async () => {
    const res = await request(app).post('/api/v1/auth/login').send([]);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects malformed JSON', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('GET /api/v1/auth/me', () => {
  const me = (authorization) => {
    const req = request(app).get('/api/v1/auth/me');
    return authorization ? req.set('Authorization', authorization) : req;
  };
  const tokenFor = (claims, options = {}) =>
    jwt.sign(claims, 'test-secret', { algorithm: 'HS256', expiresIn: 60, ...options });

  it('returns the user without the password hash', async () => {
    const { body: tokens } = await login({ tenant_id: TENANT_ID, email: user.email, password: PASSWORD });

    const res = await me(`Bearer ${tokens.access_token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: user.id, email: user.email, role: 'ADMIN', tenant_id: TENANT_ID });
  });

  it('401 UNAUTHORIZED without a Bearer header', async () => {
    expect((await me()).body.error.code).toBe('UNAUTHORIZED');
    expect((await me('Basic abc')).status).toBe(401);
  });

  it('401 INVALID_TOKEN for a token signed with another secret', async () => {
    const forged = jwt.sign({ role: 'SUPER_ADMIN', tenant_id: TENANT_ID }, 'attacker', { subject: user.id });

    const res = await me(`Bearer ${forged}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('401 INVALID_TOKEN for an unsigned ("alg: none") token', async () => {
    const unsigned = jwt.sign({ role: 'SUPER_ADMIN', tenant_id: TENANT_ID }, null, {
      algorithm: 'none',
      subject: user.id,
    });

    expect((await me(`Bearer ${unsigned}`)).body.error.code).toBe('INVALID_TOKEN');
  });

  it('401 TOKEN_EXPIRED for an expired token', async () => {
    const expired = tokenFor({ role: 'ADMIN', tenant_id: TENANT_ID }, { subject: user.id, expiresIn: -10 });

    const res = await me(`Bearer ${expired}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('401 when the user has been deleted since the token was issued', async () => {
    const orphan = tokenFor({ role: 'ADMIN', tenant_id: TENANT_ID }, { subject: crypto.randomUUID() });

    const res = await me(`Bearer ${orphan}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('GET /api/v1/auth/verify', () => {
  const verify = (authorization) => {
    const req = request(app).get('/api/v1/auth/verify');
    return authorization ? req.set('Authorization', authorization) : req;
  };

  it('returns only id, role and tenant_id for a valid token', async () => {
    const { body: tokens } = await login({ tenant_id: TENANT_ID, email: user.email, password: PASSWORD });

    const res = await verify(`Bearer ${tokens.access_token}`);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({ id: user.id, email: user.email, role: 'ADMIN', tenant_id: TENANT_ID });
  });

  it('401 without a token', async () => {
    const res = await verify();

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('401 for a disabled user even if the token is still valid', async () => {
    const { body: tokens } = await login({ tenant_id: TENANT_ID, email: user.email, password: PASSWORD });
    user.is_active = 0;
    try {
      const res = await verify(`Bearer ${tokens.access_token}`);
      expect(res.status).toBe(401);
    } finally {
      user.is_active = 1;
    }
  });
});
