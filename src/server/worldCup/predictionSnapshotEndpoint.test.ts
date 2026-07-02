import { describe, expect, it, vi } from 'vitest';
import { handlePredictionSnapshotRequest } from './predictionSnapshotEndpoint';

const config = {
  cronSecret: 'cron-secret',
  supabaseUrl: 'https://project.supabase.co',
  serviceRoleKey: 'service-role-key',
};

describe('handlePredictionSnapshotRequest', () => {
  it('rejects requests without the private cron bearer token', async () => {
    const runJob = vi.fn();
    const response = await handlePredictionSnapshotRequest(
      new Request('https://example.com/api/world-cup/prediction-snapshot', {
        method: 'POST',
      }),
      config,
      { runJob },
    );

    expect(response.status).toBe(401);
    expect(runJob).not.toHaveBeenCalled();
  });

  it('runs the snapshot job for an authorized POST request', async () => {
    const runJob = vi.fn(async () => ({
      source: 'openfootball' as const,
      written: 3,
      evidenceWritten: 2,
    }));
    const recordStatus = vi.fn(async () => undefined);
    const response = await handlePredictionSnapshotRequest(
      new Request('https://example.com/api/world-cup/prediction-snapshot', {
        method: 'POST',
        headers: { Authorization: 'Bearer cron-secret' },
      }),
      config,
      {
        runJob,
        recordStatus,
        now: () => new Date('2026-07-01T14:27:00.000Z'),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      source: 'openfootball',
      written: 3,
      evidenceWritten: 2,
    });
    expect(runJob).toHaveBeenCalledOnce();
    expect(recordStatus).toHaveBeenCalledWith({
      status: 'success',
      checkedAt: '2026-07-01T14:27:00.000Z',
      source: 'openfootball',
      snapshotsWritten: 3,
      evidenceWritten: 2,
      message: 'World Cup evidence job completed.',
    });
  });

  it('accepts an authorized Vercel cron GET request', async () => {
    const runJob = vi.fn(async () => ({
      source: 'openfootball' as const,
      written: 2,
      evidenceWritten: 1,
    }));
    const response = await handlePredictionSnapshotRequest(
      new Request('https://example.com/api/world-cup/prediction-snapshot', {
        method: 'GET',
        headers: { Authorization: 'Bearer cron-secret' },
      }),
      config,
      {
        runJob,
        recordStatus: async () => undefined,
      },
    );

    expect(response.status).toBe(200);
    expect(runJob).toHaveBeenCalledOnce();
  });

  it('returns a generic failure without leaking provider or database details', async () => {
    const runJob = vi.fn(async () => {
      throw new Error('service-role-key must never appear');
    });
    const recordStatus = vi.fn(async () => undefined);
    const response = await handlePredictionSnapshotRequest(
      new Request('https://example.com/api/world-cup/prediction-snapshot', {
        method: 'POST',
        headers: { Authorization: 'Bearer cron-secret' },
      }),
      config,
      {
        runJob,
        recordStatus,
        now: () => new Date('2026-07-01T14:28:00.000Z'),
      },
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'World Cup evidence job failed.',
    });
    expect(recordStatus).toHaveBeenCalledWith({
      status: 'failure',
      checkedAt: '2026-07-01T14:28:00.000Z',
      source: null,
      snapshotsWritten: 0,
      evidenceWritten: 0,
      message: 'World Cup evidence job failed.',
    });
  });
});
