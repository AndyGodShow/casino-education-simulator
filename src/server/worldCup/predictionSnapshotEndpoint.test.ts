import { afterEach, describe, expect, it, vi } from 'vitest';
import { handlePredictionSnapshotRequest } from './predictionSnapshotEndpoint';

const config = {
  cronSecret: 'cron-secret',
  supabaseUrl: 'https://project.supabase.co',
  serviceRoleKey: 'service-role-key',
};

afterEach(() => {
  vi.useRealTimers();
});

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
      predictionInput: 'historical_elo' as const,
    }));
    const recordStatus = vi.fn(async () => undefined);
    const pruneTelemetry = vi.fn(async () => 12);
    const response = await handlePredictionSnapshotRequest(
      new Request('https://example.com/api/world-cup/prediction-snapshot', {
        method: 'POST',
        headers: { Authorization: 'Bearer cron-secret' },
      }),
      config,
      {
        runJob,
        recordStatus,
        pruneTelemetry,
        now: () => new Date('2026-07-01T14:27:00.000Z'),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      source: 'openfootball',
      written: 3,
      evidenceWritten: 2,
      predictionInput: 'historical_elo',
      telemetryRowsPruned: 12,
    });
    expect(runJob).toHaveBeenCalledOnce();
    expect(pruneTelemetry).toHaveBeenCalledOnce();
    expect(recordStatus).toHaveBeenCalledWith({
      status: 'success',
      checkedAt: '2026-07-01T14:27:00.000Z',
      source: 'openfootball',
      snapshotsWritten: 3,
      evidenceWritten: 2,
      message: 'World Cup evidence job completed with historical_elo prediction inputs.',
    });
  });

  it('accepts an authorized Vercel cron GET request', async () => {
    const runJob = vi.fn(async () => ({
      source: 'openfootball' as const,
      written: 2,
      evidenceWritten: 1,
      predictionInput: 'baseline' as const,
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
        pruneTelemetry: async () => 0,
      },
    );

    expect(response.status).toBe(200);
    expect(runJob).toHaveBeenCalledOnce();
  });

  it('fails the monitored job when durable telemetry retention cannot run', async () => {
    const runJob = vi.fn(async () => ({
      source: 'openfootball' as const,
      written: 0,
      evidenceWritten: 0,
      predictionInput: 'baseline' as const,
    }));
    const recordStatus = vi.fn(async () => undefined);
    const response = await handlePredictionSnapshotRequest(
      new Request('https://example.com/api/world-cup/prediction-snapshot', {
        method: 'GET',
        headers: { Authorization: 'Bearer cron-secret' },
      }),
      config,
      {
        runJob,
        recordStatus,
        pruneTelemetry: async () => {
          throw new Error('private database detail');
        },
      },
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'World Cup evidence job failed.',
    });
    expect(recordStatus).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failure',
      message: 'World Cup evidence job failed.',
    }));
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

  it('aborts a slow strategy research request and records only a sanitized failure', async () => {
    vi.useFakeTimers();
    const upstreamDetail = 'upstream research token=secret internal detail';
    let passedSignal: AbortSignal | undefined;
    const researchFetcherMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        passedSignal = init?.signal ?? undefined;
        passedSignal?.addEventListener('abort', () => {
          reject(new Error(upstreamDetail));
        }, { once: true });
      })
    ));
    const fetchResearch = researchFetcherMock as unknown as typeof fetch;
    const runJob = vi.fn(async (input: {
      loadStrategyResearch: () => Promise<unknown>;
    }) => {
      await input.loadStrategyResearch();
      return {
        source: 'openfootball' as const,
        written: 0,
        evidenceWritten: 0,
        predictionInput: 'baseline' as const,
      };
    });
    const recordStatus = vi.fn(async () => undefined);

    const responsePromise = handlePredictionSnapshotRequest(
      new Request('https://example.com/api/world-cup/prediction-snapshot', {
        method: 'POST',
        headers: { Authorization: 'Bearer cron-secret' },
      }),
      config,
      {
        runJob,
        fetchResearch,
        recordStatus,
        now: () => new Date('2026-07-01T14:29:00.000Z'),
      },
    );

    await vi.waitFor(() => expect(researchFetcherMock).toHaveBeenCalledOnce());
    const [researchUrl, researchInit] = researchFetcherMock.mock.calls[0];
    expect(new URL(String(researchUrl))).toMatchObject({
      pathname: '/api/world-cup/research',
      search: '',
    });
    expect(researchInit?.headers).toEqual({ Accept: 'application/json' });
    expect(passedSignal).toBeInstanceOf(AbortSignal);
    expect(passedSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(12_000);

    expect(passedSignal?.aborted).toBe(true);
    const response = await responsePromise;
    expect(response.status).toBe(502);
    expect(recordStatus).toHaveBeenCalledOnce();
    expect(recordStatus).toHaveBeenCalledWith({
      status: 'failure',
      checkedAt: '2026-07-01T14:29:00.000Z',
      source: null,
      snapshotsWritten: 0,
      evidenceWritten: 0,
      message: 'World Cup evidence job failed.',
    });
    const body = await response.text();
    expect(body).not.toContain(upstreamDetail);
    expect(body).not.toContain('token=secret');
  });
});
