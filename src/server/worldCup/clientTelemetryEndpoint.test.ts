import { afterEach, describe, expect, it, vi } from 'vitest';
import telemetryApi from '../../../api/world-cup/client-telemetry';
import type { ClientTelemetryRecord } from './clientTelemetryRepository';
import { handleClientTelemetryRequest } from './clientTelemetryEndpoint';

const metricEvent = {
  schemaVersion: 1,
  kind: 'web-vital',
  name: 'LCP',
  value: 1_250.5,
  rating: 'good',
  route: 'world-cup',
  navigationType: 'navigate',
};

const requestFor = (
  body: string = JSON.stringify(metricEvent),
  init: Omit<RequestInit, 'body'> = {},
) => new Request('https://app.test/api/world-cup/client-telemetry', {
  method: 'POST',
  headers: {
    'content-type': 'application/json; charset=utf-8',
    origin: 'https://app.test',
  },
  ...init,
  body,
});

const config = {
  supabaseUrl: 'https://project.supabase.co',
  serviceRoleKey: 'service-secret',
};

const expectedSecurityHeaders = (response: Response) => {
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('x-frame-options')).toBe('DENY');
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('handleClientTelemetryRequest', () => {
  it('accepts a valid event and persists server-owned metadata', async () => {
    const persisted: ClientTelemetryRecord[][] = [];
    const response = await handleClientTelemetryRequest(requestFor(), config, {
      now: () => new Date('2026-07-03T12:03:45.000Z'),
      persist: async (records) => {
        persisted.push(records);
      },
    });

    expect(response.status).toBe(202);
    expect(await response.text()).toBe('');
    expectedSecurityHeaders(response);
    expect(persisted).toEqual([[
      {
        event: {
          ...metricEvent,
          value: 1_250,
        },
        receivedAt: '2026-07-03T12:03:45.000Z',
        bucketStart: '2026-07-03T12:00:00.000Z',
        dedupeKey: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      },
    ]]);
  });

  it('quantizes metrics before persistence and deduplication', async () => {
    const records: ClientTelemetryRecord[] = [];
    const persist = async (batch: ClientTelemetryRecord[]) => {
      const record = batch[0];
      if (record) records.push(record);
    };
    const metricAt = (value: number) =>
      handleClientTelemetryRequest(requestFor(JSON.stringify({
        ...metricEvent,
        value,
      })), config, {
        now: () => new Date('2026-07-03T12:02:00.000Z'),
        persist,
      });

    await metricAt(1_251);
    await metricAt(1_274);
    await metricAt(1_275);

    expect(records.map((record) =>
      record.event.kind === 'web-vital' ? record.event.value : null)).toEqual([
      1_250,
      1_250,
      1_300,
    ]);
    expect(records[0]?.dedupeKey).toBe(records[1]?.dedupeKey);
    expect(records[2]?.dedupeKey).not.toBe(records[1]?.dedupeKey);
  });

  it('uses stable five-minute error buckets grouped by fingerprint', async () => {
    const keys: string[] = [];
    const persist = async (records: ClientTelemetryRecord[]) => {
      keys.push(records[0]?.dedupeKey ?? '');
    };
    const errorAt = (fingerprint: string, now: string) =>
      handleClientTelemetryRequest(requestFor(JSON.stringify({
        schemaVersion: 1,
        kind: 'runtime-error',
        name: 'window-error',
        fingerprint,
        route: 'world-cup',
        navigationType: 'navigate',
      })), config, {
        now: () => new Date(now),
        persist,
      });

    await errorAt('a'.repeat(64), '2026-07-03T12:00:01.000Z');
    await errorAt('a'.repeat(64), '2026-07-03T12:04:59.999Z');
    await errorAt('b'.repeat(64), '2026-07-03T12:04:59.999Z');
    await errorAt('b'.repeat(64), '2026-07-03T12:05:00.000Z');

    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
    expect(keys[3]).not.toBe(keys[2]);
  });

  it('rejects methods other than POST', async () => {
    const response = await handleClientTelemetryRequest(
      new Request('https://app.test/api/world-cup/client-telemetry'),
      config,
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expectedSecurityHeaders(response);
  });

  it.each([
    [undefined],
    ['https://attacker.test'],
    ['null'],
  ])('rejects a missing or cross-origin Origin header (%s)', async (origin) => {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (origin) headers.set('origin', origin);
    const response = await handleClientTelemetryRequest(requestFor(undefined, { headers }), config);
    expect(response.status).toBe(403);
    expectedSecurityHeaders(response);
  });

  it('rejects non-JSON media types', async () => {
    const response = await handleClientTelemetryRequest(requestFor(undefined, {
      headers: {
        'content-type': 'text/plain',
        origin: 'https://app.test',
      },
    }), config);
    expect(response.status).toBe(415);
  });

  it('rejects a declared oversized body without reading or persisting it', async () => {
    const persist = vi.fn();
    const response = await handleClientTelemetryRequest(requestFor('{}', {
      headers: {
        'content-type': 'application/json',
        'content-length': '2049',
        origin: 'https://app.test',
      },
    }), config, { persist });
    expect(response.status).toBe(413);
    expect(persist).not.toHaveBeenCalled();
  });

  it('rejects an actual UTF-8 body over 2,048 bytes', async () => {
    const response = await handleClientTelemetryRequest(requestFor(JSON.stringify({
      ...metricEvent,
      padding: '界'.repeat(700),
    })), config);
    expect(response.status).toBe(413);
  });

  it('cancels request streaming as soon as the byte limit is exceeded', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(2_049)));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request('https://app.test/api/world-cup/client-telemetry', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://app.test',
      },
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    const response = await handleClientTelemetryRequest(request, config);

    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
  });

  it.each([
    ['{'],
    [JSON.stringify({ ...metricEvent, message: 'do not store me' })],
    [JSON.stringify({ ...metricEvent, value: Number.POSITIVE_INFINITY })],
  ])('rejects malformed or invalid payloads without echoing them', async (body) => {
    const response = await handleClientTelemetryRequest(requestFor(body), config);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Invalid client telemetry.',
    });
    expectedSecurityHeaders(response);
  });

  it('sanitizes unconfigured and persistence failures', async () => {
    const unconfigured = await handleClientTelemetryRequest(requestFor(), {
      supabaseUrl: '',
      serviceRoleKey: '',
    });
    expect(unconfigured.status).toBe(503);
    expect(await unconfigured.json()).toEqual({
      ok: false,
      error: 'Client telemetry is unavailable.',
    });
    expect(unconfigured.headers.get('retry-after')).toBe('300');

    const failed = await handleClientTelemetryRequest(requestFor(), config, {
      persist: async () => {
        throw new Error('database token=private');
      },
    });
    expect(failed.status).toBe(503);
    const failedBody = await failed.text();
    expect(failedBody).not.toContain('database');
    expect(failedBody).not.toContain('private');
  });
});

describe('client telemetry Vercel adapter', () => {
  it('maps only server-side Supabase configuration into persistence', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-secret');
    const fetcher = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetcher);

    const response = await telemetryApi.fetch(requestFor());

    expect(response.status).toBe(202);
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/rest/v1/rpc/record_world_cup_client_telemetry'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer service-secret',
        }),
      }),
    );
  });
});
