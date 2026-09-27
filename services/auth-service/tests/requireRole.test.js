const express = require('express');
const request = require('supertest');
const requireRole = require('../src/middleware/requireRole');

// A tiny app that fakes the logged-in user from a test header.
function appWithUser(role) {
  const app = express();
  app.use((req, res, next) => {
    if (role) req.user = { id: 'u1', role };
    next();
  });
  app.get('/admin-only', requireRole('ADMIN', 'SUPER_ADMIN'), (req, res) => res.json({ ok: true }));
  return app;
}

describe('requireRole', () => {
  it.each(['ADMIN', 'SUPER_ADMIN'])('lets %s through', async (role) => {
    const res = await request(appWithUser(role)).get('/admin-only');

    expect(res.status).toBe(200);
  });

  it.each(['STAFF', 'STUDENT'])('blocks %s with 403 FORBIDDEN', async (role) => {
    const res = await request(appWithUser(role)).get('/admin-only');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 401 when nobody is logged in', async () => {
    const res = await request(appWithUser(null)).get('/admin-only');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('refuses to be set up without any roles', () => {
    expect(() => requireRole()).toThrow();
  });
});
