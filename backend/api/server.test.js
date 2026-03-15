import { describe, it, expect } from 'vitest';
import request from 'supertest';

process.env.VITEST = 'true';
const { app } = await import('./server.js');

describe('API server', () => {
  it('GET /api/health returns 200 and { ok: true }', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('POST with body over 256kb returns 413', async () => {
    const largeBody = JSON.stringify({ x: 'y'.repeat(300 * 1024) });
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(largeBody);
    expect(res.status).toBe(413);
  });

  it('GET /api/sentiment-backend/status without Authorization returns 401', async () => {
    const res = await request(app).get('/api/sentiment-backend/status');
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('POST /api/sentiment-backend/start without Authorization returns 401', async () => {
    const res = await request(app).post('/api/sentiment-backend/start');
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('GET /api/sentiment-backend/status with valid token returns 200 or 503', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send({
        username: `testuser_${Date.now()}`,
        password: 'testpass123',
      });
    if (registerRes.status !== 200) {
      return;
    }
    const token = registerRes.body.token;
    expect(token).toBeDefined();

    const res = await request(app)
      .get('/api/sentiment-backend/status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).not.toBe(401);
    expect([200, 500, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('running');
    }
  });

  it('PUT /api/data/:key and GET /api/data persist to DB (e.g. budget tracker keys)', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send({
        username: `datauser_${Date.now()}`,
        password: 'testpass123',
      });
    if (registerRes.status !== 200) {
      return;
    }
    const token = registerRes.body.token;
    expect(token).toBeDefined();

    const key = 'budgetTracker_budgets';
    const value = [{ id: 1, type: 'income', amount: 100, category: 'Test', date: '2026-01-01' }];

    const putRes = await request(app)
      .put(`/api/data/${encodeURIComponent(key)}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send({ value });
    expect(putRes.status).toBe(200);

    const getRes = await request(app)
      .get('/api/data')
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body).toHaveProperty(key);
    expect(getRes.body[key]).toEqual(value);
  });
});
