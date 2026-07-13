import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { testApp, loginAs, auth } from '../../tests/app.js';
import { seedTestDb } from '../../tests/seed-helper.js';

let app: FastifyInstance;
let adminToken: string;
let consultantToken: string;

beforeAll(async () => {
  await seedTestDb();
  app = await testApp();
  adminToken = (await loginAs(app, 'kushagra@vayuz.com')).access;
  consultantToken = (await loginAs(app, 'abha@vayuz.com')).access;
});
afterAll(async () => {
  await app.close();
});

const sampleJd = {
  jdId: 'TST_QA_20260601',
  title: 'QA Engineer',
  client: 'Testify',
  type: 'RADC',
  status: 'Active',
  reqDate: '2026-06-01',
  owners: ['Abha Sharma', 'External Person'],
};

describe('T5.1 HDIS list + CRUD', () => {
  it('lists HDIS by month', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/hdis?month=2026-05',
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const rows = res.json();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r: { reqDate: string }) => r.reqDate.startsWith('2026-05'))).toBe(true);
  });

  it('a consultant cannot create (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/hdis',
      headers: auth(consultantToken),
      payload: sampleJd,
    });
    expect(res.statusCode).toBe(403);
  });

  it('an admin creates a record (201) with owners + zeroed pipeline', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/hdis',
      headers: auth(adminToken),
      payload: sampleJd,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.owners).toEqual(['Abha Sharma', 'External Person']);
    expect(body.pipeline).toMatchObject({ r0: 0, r5: 0, stage: 'R0 · Sourcing' });
  });

  it('a consultant can view a record', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/hdis/${sampleJd.jdId}`,
      headers: auth(consultantToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().jdId).toBe(sampleJd.jdId);
  });
});

describe('T5.2 activity log', () => {
  it('an edit produces a diff entry', async () => {
    await app.inject({
      method: 'PATCH',
      url: `/api/hdis/${sampleJd.jdId}`,
      headers: auth(adminToken),
      payload: { openings: 3, client: 'Testify Inc' },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/hdis/${sampleJd.jdId}/activity`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const log = res.json();
    const edit = log.find((e: { action: string }) => e.action === 'edit');
    expect(edit).toBeDefined();
    expect(edit.detail).toContain('openings: 1 → 3');
    expect(edit.actor).toBe('Kushagra Bindra');
  });
});

describe('T5.3 pipeline recorder', () => {
  it('logs an R1 change and syncs status when stage → Closed', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/hdis/${sampleJd.jdId}/pipeline`,
      headers: auth(adminToken),
      payload: { r0: 5, r1: 3, r2: 0, r3: 0, r4: 0, r5: 1, stage: 'Closed' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('Closed');
    expect(res.json().pipeline.r1).toBe(3);

    const activity = await app.inject({
      method: 'GET',
      url: `/api/hdis/${sampleJd.jdId}/activity`,
      headers: auth(adminToken),
    });
    const entry = activity.json().find((e: { action: string }) => e.action === 'pipeline update');
    expect(entry.detail).toContain('R1 0→3');
    expect(entry.detail).toContain('Closed');
  });

  it('a consultant cannot record pipeline (403)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/hdis/${sampleJd.jdId}/pipeline`,
      headers: auth(consultantToken),
      payload: { r0: 1, r1: 1, r2: 0, r3: 0, r4: 0, r5: 0, stage: 'On Hold' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('T5.4 JD link + attachments', () => {
  it('sets a JD link', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/hdis/${sampleJd.jdId}/link`,
      headers: auth(adminToken),
      payload: { jdLink: 'https://example.com/jd.pdf' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().jdLink).toBe('https://example.com/jd.pdf');
  });

  function multipart(fileName: string, contentType: string, content: string) {
    const boundary = '----ppgtestboundary';
    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n` +
      `${content}\r\n` +
      `--${boundary}--\r\n`;
    return { body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
  }

  it('rejects a disallowed mime type (.exe)', async () => {
    const mp = multipart('malware.exe', 'application/x-msdownload', 'MZ...');
    const res = await app.inject({
      method: 'POST',
      url: `/api/hdis/${sampleJd.jdId}/attachments`,
      headers: { ...auth(adminToken), ...mp.headers },
      payload: mp.body,
    });
    expect(res.statusCode).toBe(400);
  });

  it('uploads a PDF and downloads it back (roundtrip)', async () => {
    const mp = multipart('jd.pdf', 'application/pdf', '%PDF-1.4 fake content');
    const up = await app.inject({
      method: 'POST',
      url: `/api/hdis/${sampleJd.jdId}/attachments`,
      headers: { ...auth(adminToken), ...mp.headers },
      payload: mp.body,
    });
    expect(up.statusCode).toBe(201);
    const attId = up.json().id;

    const down = await app.inject({
      method: 'GET',
      url: `/api/hdis/${sampleJd.jdId}/attachments/${attId}`,
      headers: auth(adminToken),
    });
    expect(down.statusCode).toBe(200);
    expect(down.headers['content-type']).toContain('application/pdf');
    expect(down.body).toContain('%PDF-1.4 fake content');
  });

  it('requires auth to download (401)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/hdis/${sampleJd.jdId}/attachments/does-not-matter`,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('delete', () => {
  it('an admin deletes a record (204)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/hdis/${sampleJd.jdId}`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(204);
    const after = await app.inject({
      method: 'GET',
      url: `/api/hdis/${sampleJd.jdId}`,
      headers: auth(adminToken),
    });
    expect(after.statusCode).toBe(404);
  });
});
