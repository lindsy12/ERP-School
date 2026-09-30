const jwt = require('jsonwebtoken');
const request = require('supertest');

jest.mock('../src/models/user.model');
jest.mock('../src/models/refreshToken.model');
const userModel = require('../src/models/user.model');
const refreshTokenModel = require('../src/models/refreshToken.model');

const app = require('../src/app');
const { fakeUserTable, accessTokenFor, PASSWORD } = require('./fakeUserTable');

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const NEW_PASSWORD = 'Brand-New-Pass-2';
let table;
let student;

beforeEach(async () => {
  jest.resetAllMocks();
  table = fakeUserTable(userModel);
  refreshTokenModel.startFamily.mockResolvedValue();
  student = await table.add({ role: 'STUDENT', tenantId: TENANT_ID });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

const changePassword = (token, body) =>
  request(app).post('/api/v1/auth/change-password').set('Authorization', `Bearer ${token}`).send(body);
const verify = (token) => request(app).get('/api/v1/auth/verify').set('Authorization', `Bearer ${token}`);
const login = (password) =>
  request(app).post('/api/v1/auth/login').send({ tenant_id: TENANT_ID, email: student.email, password });

describe('POST /api/v1/auth/change-password', () => {
  it('changes the password, ends every other session and returns a fresh token pair', async () => {
    const oldToken = accessTokenFor(student, { issuedSecondsAgo: 5 });

    const res = await changePassword(oldToken, { current_password: PASSWORD, new_password: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      token_type: 'Bearer',
      expires_in: 900,
    });
    expect(jwt.decode(res.body.access_token).sub).toBe(student.id);
    expect(table.sessionsEndedFor).toEqual([student.id]);
    expect(refreshTokenModel.startFamily).toHaveBeenCalledTimes(1); // the new session
    expect(JSON.parse(console.log.mock.calls.at(-1)[0])).toMatchObject({ event: 'auth.password.changed', userId: student.id });

    expect((await verify(oldToken)).status).toBe(401); // issued before the change
    expect((await verify(res.body.access_token)).status).toBe(200); // issued in the same second, after it
    expect((await login(PASSWORD)).status).toBe(401);
    expect((await login(NEW_PASSWORD)).status).toBe(200);
  });

  it('a wrong current password is a 400 on that field and counts as a failed login', async () => {
    const token = accessTokenFor(student);

    const res = await changePassword(token, { current_password: 'Wrong-Password', new_password: NEW_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ field: 'current_password', message: 'is incorrect' }]);
    expect(student.failed_login_attempts).toBe(1);
    expect(userModel.setPassword).not.toHaveBeenCalled();
  });

  it('five wrong current passwords lock the account', async () => {
    const token = accessTokenFor(student);
    const wrong = { current_password: 'Wrong-Password', new_password: NEW_PASSWORD };

    for (let i = 0; i < 4; i += 1) expect((await changePassword(token, wrong)).status).toBe(400);
    const fifth = await changePassword(token, wrong);
    const rightOneNow = await changePassword(token, { current_password: PASSWORD, new_password: NEW_PASSWORD });

    expect(fifth.status).toBe(423);
    expect(rightOneNow.status).toBe(423);
    expect(userModel.setPassword).not.toHaveBeenCalled();
  });

  it('400 when the new password is too short or the same as the current one', async () => {
    const token = accessTokenFor(student);

    const short = await changePassword(token, { current_password: PASSWORD, new_password: 'abc' });
    const same = await changePassword(token, { current_password: PASSWORD, new_password: PASSWORD });

    expect(short.body.error.details).toEqual([{ field: 'new_password', message: 'must be at least 8 characters' }]);
    expect(same.body.error.details).toEqual([
      { field: 'new_password', message: 'must be different from the current password' },
    ]);
  });

  it('401 without an access token', async () => {
    const res = await request(app).post('/api/v1/auth/change-password').send({});

    expect(res.status).toBe(401);
  });
});
