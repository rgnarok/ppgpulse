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
  reqDate: '2026-06-01',
  owners: ['Abha Sharma', 'External Person'],
};

// Every REQUIRED_DETAIL_FIELDS key from hdis/service.ts, filled in — used to prove a
// requirement CAN reach "Active" once the questionnaire (+ an attachment) is complete.
const completeDetail = {
  bigMemberName: 'Abha Sharma',
  requirementsReceived: 1,
  requirementName: 'QA Engineer',
  engagementType: 'FTE',
  clientType: 'Existing',
  roleBackground: 'Replacement',
  positionOpenDuration: '6-10 days',
  hiringDeadline: 'End of month',
  interviewRoundsCount: 3,
  interviewRoundsDefinition: 'Assessment, Technical, HR',
  positionsAlreadyFilled: 0,
  clientAttemptedInternalHiring: false,
  vayuzExclusive: true,
  vendorCount: '0',
  vendorsSharingProfiles: 'No',
  vendorSubmissionDuration: 'N/A',
  duplicateProfileTimeline: '48 hours',
  commercialRates: '18 LPA',
  clientPocDetails: 'Jane Doe, jane@testify.com',
  additionalInsights: 'Client is flexible on start date.',
  closureConfidence: 'High',
  atsUsed: 'Greenhouse',
};

describe('T5.1 HDIS list + CRUD', () => {
  it('lists HDIS by month, carrying forward any still-open requirement from earlier months', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/hdis?month=2026-05',
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const rows = res.json() as { reqDate: string; status: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.reqDate.startsWith('2026-05'))).toBe(true);
    // Anything outside the selected month only belongs here because it's still open —
    // never a Fulfilled/Closed record from a prior month.
    for (const r of rows) {
      if (!r.reqDate.startsWith('2026-05')) {
        expect(r.reqDate < '2026-05-01').toBe(true);
        expect(['Fulfilled', 'Closed']).not.toContain(r.status);
      }
    }
  });

  it('does not carry a Fulfilled/Closed requirement forward into a later month filter', async () => {
    const jdId = 'TST_CARRYFWD_20260301';
    await app.inject({
      method: 'POST',
      url: '/api/hdis',
      headers: auth(adminToken),
      payload: { ...sampleJd, jdId, reqDate: '2026-03-01' },
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/hdis/${jdId}`,
      headers: auth(adminToken),
      payload: { status: 'Closed', statusReason: 'Cancelled by client' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/hdis?month=2026-05',
      headers: auth(adminToken),
    });
    const rows = res.json() as { jdId: string }[];
    expect(rows.some((r) => r.jdId === jdId)).toBe(false);
  });

  it('carries an Active requirement from an earlier month into the current month filter', async () => {
    const jdId = 'TST_CARRYFWD_20260302';
    await app.inject({
      method: 'POST',
      url: '/api/hdis',
      headers: auth(adminToken),
      payload: { ...sampleJd, jdId, reqDate: '2026-03-02' },
    });
    await app.inject({
      method: 'PUT',
      url: `/api/hdis/${jdId}/details`,
      headers: auth(adminToken),
      payload: completeDetail,
    });
    const { body: fileBody, headers: fileHeaders } = multipart(
      'req-email.png',
      'image/png',
      'fake-screenshot-bytes',
    );
    await app.inject({
      method: 'POST',
      url: `/api/hdis/${jdId}/attachments`,
      headers: { ...auth(adminToken), ...fileHeaders },
      payload: fileBody,
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/hdis/${jdId}`,
      headers: auth(adminToken),
      payload: { status: 'Active' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/hdis?month=2026-05',
      headers: auth(adminToken),
    });
    const rows = res.json() as { jdId: string }[];
    expect(rows.some((r) => r.jdId === jdId)).toBe(true);
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

  it("accepts a PNG screenshot — needed for the requirement questionnaire's email screenshot", async () => {
    const mp = multipart('req-email.png', 'image/png', 'fake-png-bytes');
    const res = await app.inject({
      method: 'POST',
      url: `/api/hdis/${sampleJd.jdId}/attachments`,
      headers: { ...auth(adminToken), ...mp.headers },
      payload: mp.body,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().fileName).toBe('req-email.png');
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

describe('T5.5 Pending status + requirement questionnaire', () => {
  const jdId = 'TST_PEND_20260601';
  const jd = {
    jdId,
    title: 'Backend Engineer',
    client: 'Testify',
    type: 'RADF',
    reqDate: '2026-06-05',
    owners: ['Abha Sharma'],
  };

  it('a new record always starts Pending, regardless of any status sent', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/hdis',
      headers: auth(adminToken),
      payload: { ...jd, status: 'Active' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe('Pending');
    expect(res.json().detailsComplete).toBe(false);
  });

  it('cannot be moved to Active before the questionnaire is complete (400)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/hdis/${jdId}`,
      headers: auth(adminToken),
      payload: { status: 'Active' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('details_incomplete');
  });

  it('recording pipeline progress on a Pending record does not silently promote it to Active', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/hdis/${jdId}/pipeline`,
      headers: auth(adminToken),
      payload: { r0: 3, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, stage: 'R0 · Sourcing' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('Pending');
  });

  it('a partial questionnaire save persists as a draft without completing it', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/hdis/${jdId}/details`,
      headers: auth(adminToken),
      payload: { bigMemberName: 'Abha Sharma', requirementName: 'Backend Engineer' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().detailsComplete).toBe(false);
    expect(res.json().requirementDetail.bigMemberName).toBe('Abha Sharma');
  });

  it('completing the questionnaire + an attachment unlocks Active', async () => {
    const detailRes = await app.inject({
      method: 'PUT',
      url: `/api/hdis/${jdId}/details`,
      headers: auth(adminToken),
      payload: completeDetail,
    });
    // No attachment uploaded yet — still incomplete.
    expect(detailRes.json().detailsComplete).toBe(false);

    const mp = multipart('email.png', 'image/png', 'fake-png-bytes');
    const uploadRes = await app.inject({
      method: 'POST',
      url: `/api/hdis/${jdId}/attachments`,
      headers: { ...auth(adminToken), ...mp.headers },
      payload: mp.body,
    });
    expect(uploadRes.statusCode).toBe(201);

    const activateRes = await app.inject({
      method: 'PATCH',
      url: `/api/hdis/${jdId}`,
      headers: auth(adminToken),
      payload: { status: 'Active' },
    });
    expect(activateRes.statusCode).toBe(200);
    expect(activateRes.json().status).toBe('Active');
    expect(activateRes.json().detailsComplete).toBe(true);
  });

  it("reactivating an On Hold record is NOT blocked by an incomplete questionnaire — the gate is only for a record's first activation out of Pending", async () => {
    const onHoldJdId = 'TST_ONHOLD_REACTIVATE_20260601';
    await app.inject({
      method: 'POST',
      url: '/api/hdis',
      headers: auth(adminToken),
      payload: { ...jd, jdId: onHoldJdId },
    });
    // Put it On Hold — this record never had its questionnaire completed, matching
    // the many pre-existing records created before the questionnaire feature shipped.
    await app.inject({
      method: 'PATCH',
      url: `/api/hdis/${onHoldJdId}`,
      headers: auth(adminToken),
      payload: { status: 'On Hold', statusReason: 'Hold By VAYUZ' },
    });

    const reactivateRes = await app.inject({
      method: 'PATCH',
      url: `/api/hdis/${onHoldJdId}`,
      headers: auth(adminToken),
      payload: { status: 'Active' },
    });
    expect(reactivateRes.statusCode).toBe(200);
    expect(reactivateRes.json().status).toBe('Active');
    expect(reactivateRes.json().detailsComplete).toBe(false);
  });
});

describe('T5.6 Candidates', () => {
  const jdId = sampleJd.jdId;
  let candidateId: string;

  it('a consultant (owner) can add a candidate', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/hdis/${jdId}/candidates`,
      headers: auth(consultantToken),
      payload: {
        name: 'Priya Kumar',
        techStack: 'Java',
        ownerName: 'Abha Sharma',
        stage: 'R1',
        submittedAt: '2026-06-05',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe('Priya Kumar');
    expect(body.status).toBe('Active');
    candidateId = body.id;
  });

  it('lists candidates for a requirement', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/hdis/${jdId}/candidates`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const rows = res.json();
    expect(rows.some((c: { id: string }) => c.id === candidateId)).toBe(true);
  });

  it('marking a candidate Dropped without a reason is rejected (400)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/hdis/${jdId}/candidates/${candidateId}`,
      headers: auth(adminToken),
      payload: { status: 'Dropped' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('drop_reason_required');
  });

  it('marking a candidate Joined auto-fills closedAt when not supplied', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/hdis/${jdId}/candidates/${candidateId}`,
      headers: auth(adminToken),
      payload: { status: 'Joined', stage: 'R5' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('Joined');
    expect(body.closedAt).toBeTruthy();
  });

  it('a candidate can be logged for a different tech stack/recruiter than the requirement owner', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/hdis/${jdId}/candidates`,
      headers: auth(consultantToken),
      payload: {
        name: 'Someone Else',
        techStack: '.NET',
        ownerName: 'External Person',
        submittedAt: '2026-06-06',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().ownerName).toBe('External Person');
  });

  it('an admin removes a candidate (204)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/hdis/${jdId}/candidates/${candidateId}`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(204);
    const after = await app.inject({
      method: 'GET',
      url: `/api/hdis/${jdId}/candidates`,
      headers: auth(adminToken),
    });
    expect(after.json().some((c: { id: string }) => c.id === candidateId)).toBe(false);
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
