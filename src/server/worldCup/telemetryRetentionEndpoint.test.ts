import { describe, expect, it, vi } from 'vitest';
import { handleTelemetryRetentionRequest } from './telemetryRetentionEndpoint';

const config = {
  cronSecret: 'cron-secret',
  supabaseUrl: 'https://project.supabase.co',
  serviceRoleKey: 'service-role-key',
};

const request = (method: string, authorization?: string) => new Request(
  'https://example.com/api/world-cup/telemetry-retention',
  {
    method,
    headers: authorization ? { Authorization: authorization } : undefined,
  },
);

const expectNoStore = (response: Response) => {
  expect(response.headers.get('cache-control')).toBe('no-store');
};

describe('handleTelemetryRetentionRequest', () => {
  it('rejects requests without the private cron bearer token', async () => {
    const pruneTelemetry = vi.fn(async () => 0);

    const response = await handleTelemetryRetentionRequest(
      request('POST'),
      config,
      { pruneTelemetry },
    );

    expect(response.status).toBe(401);
    expectNoStore(response);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Unauthorized.',
    });
    expect(pruneTelemetry).not.toHaveBeenCalled();
  });

  it.each(['GET', 'POST'])('uses the same authorized bearer contract for %s', async (method) => {
    const pruneTelemetry = vi.fn(async () => 12);

    const response = await handleTelemetryRetentionRequest(
      request(method, 'Bearer cron-secret'),
      config,
      { pruneTelemetry },
    );

    expect(response.status).toBe(200);
    expectNoStore(response);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      telemetryRowsPruned: 12,
    });
    expect(pruneTelemetry).toHaveBeenCalledOnce();
  });

  it('rejects unsupported methods without running retention', async () => {
    const pruneTelemetry = vi.fn(async () => 0);

    const response = await handleTelemetryRetentionRequest(
      request('PUT', 'Bearer cron-secret'),
      config,
      { pruneTelemetry },
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, POST');
    expectNoStore(response);
    expect(pruneTelemetry).not.toHaveBeenCalled();
  });

  it('returns an unavailable response when retention is not configured', async () => {
    const pruneTelemetry = vi.fn(async () => 0);

    const response = await handleTelemetryRetentionRequest(
      request('POST', 'Bearer cron-secret'),
      { ...config, serviceRoleKey: '' },
      { pruneTelemetry },
    );

    expect(response.status).toBe(503);
    expectNoStore(response);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Telemetry retention service is not configured.',
    });
    expect(pruneTelemetry).not.toHaveBeenCalled();
  });

  it('returns a sanitized repository failure without leaking private details', async () => {
    const privateDetail = 'service-role-key private database detail';
    const pruneTelemetry = vi.fn(async () => {
      throw new Error(privateDetail);
    });

    const response = await handleTelemetryRetentionRequest(
      request('GET', 'Bearer cron-secret'),
      config,
      { pruneTelemetry },
    );

    expect(response.status).toBe(502);
    expectNoStore(response);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({
      ok: false,
      error: 'Telemetry retention failed.',
    });
    expect(body).not.toContain(privateDetail);
    expect(pruneTelemetry).toHaveBeenCalledOnce();
  });
});
