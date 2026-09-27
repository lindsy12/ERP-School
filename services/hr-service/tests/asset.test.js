const request = require('supertest');
const app = require('../src/app');
const { resetDb, adminToken, staffToken } = require('./helpers');

beforeEach(resetDb);

const validAsset = { name: 'Dell Laptop', category: 'IT Equipment', serialNumber: 'SN-001', status: 'available' };

describe('Asset/inventory management', () => {
  test('rejects non-managers from creating assets', async () => {
    const res = await request(app)
      .post('/api/v1/hr/assets')
      .set('Authorization', `Bearer ${staffToken(1)}`)
      .send(validAsset);
    expect(res.status).toBe(403);
  });

  test('creates, lists, updates and deletes an asset', async () => {
    const created = await request(app)
      .post('/api/v1/hr/assets')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send(validAsset);
    expect(created.status).toBe(201);

    const list = await request(app)
      .get('/api/v1/hr/assets')
      .set('Authorization', `Bearer ${staffToken(1)}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const updated = await request(app)
      .put(`/api/v1/hr/assets/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ status: 'maintenance' });
    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe('maintenance');

    const deleted = await request(app)
      .delete(`/api/v1/hr/assets/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(deleted.status).toBe(204);
  });

  test('returns a clean 400 (not a raw 500) when assigned to a non-existent employee', async () => {
    const created = await request(app)
      .post('/api/v1/hr/assets')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send(validAsset);

    const res = await request(app)
      .put(`/api/v1/hr/assets/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ assignedTo: 999999 });
    expect(res.status).toBe(400);
  });

  test('404s when updating a non-existent asset', async () => {
    const res = await request(app)
      .put('/api/v1/hr/assets/999')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ status: 'retired' });
    expect(res.status).toBe(404);
  });
});
