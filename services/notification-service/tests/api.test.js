jest.mock('../src/models/notification.model');
jest.mock('../src/db/connection', () => ({ query: jest.fn().mockResolvedValue([[{ 1: 1 }]]) }));

const request = require('supertest');
const model = require('../src/models/notification.model');
const app = require('../src/app');

const admin = { 'x-user-id': 'u-1', 'x-user-role': 'ADMIN', 'x-tenant-id': 't-1' };

beforeEach(() => jest.resetAllMocks());

describe('notification-service API', () => {
  test('GET /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('notification-service');
  });

  test('refuses calls without gateway identity', async () => {
    const res = await request(app).get('/api/v1/notifications');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('lists my notifications with a read flag', async () => {
    model.listFor.mockResolvedValue([
      { id: 1, event_type: 'finance.invoice.created', title: 'Invoice created', message: 'm', created_at: '2026-09-30', read_at: null },
    ]);
    const res = await request(app).get('/api/v1/notifications?unread=true').set(admin);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 1, eventType: 'finance.invoice.created', title: 'Invoice created', message: 'm', read: false, createdAt: '2026-09-30' },
    ]);
    expect(model.listFor).toHaveBeenCalledWith({ id: 'u-1', role: 'ADMIN', tenantId: 't-1' }, { unreadOnly: true, limit: 50 });
  });

  test('unread count', async () => {
    model.countUnread.mockResolvedValue(3);
    const res = await request(app).get('/api/v1/notifications/unread-count').set(admin);
    expect(res.body).toEqual({ unread: 3 });
  });

  test('marking a notification I cannot see is a 404', async () => {
    model.isVisible.mockResolvedValue(false);
    const res = await request(app).patch('/api/v1/notifications/9/read').set(admin);
    expect(res.status).toBe(404);
    expect(model.markRead).not.toHaveBeenCalled();
  });

  test('marks one notification read', async () => {
    model.isVisible.mockResolvedValue(true);
    const res = await request(app).patch('/api/v1/notifications/9/read').set(admin);
    expect(res.status).toBe(204);
    expect(model.markRead).toHaveBeenCalledWith('u-1', 9);
  });

  test('bad id is a 400', async () => {
    const res = await request(app).patch('/api/v1/notifications/abc/read').set(admin);
    expect(res.status).toBe(400);
  });

  test('serves the page and the OpenAPI spec', async () => {
    expect((await request(app).get('/notifications/')).status).toBe(200);
    const spec = await request(app).get('/api/v1/notifications/openapi.json');
    expect(spec.body.info.title).toBe('Notification Service');
  });
});
