import { describe, expect, it, vi } from 'vitest';
import {
  persistClientTelemetryToSupabase,
  type ClientTelemetryRecord,
} from './clientTelemetryRepository';

const records: ClientTelemetryRecord[] = [{
  event: {
    schemaVersion: 1,
    kind: 'web-vital',
    name: 'LCP',
    value: 1_250.5,
    rating: 'good',
    route: 'world-cup',
    navigationType: 'navigate',
  },
  receivedAt: '2026-07-03T12:00:00.000Z',
  dedupeKey: 'sha256:dedupe',
}];

describe('persistClientTelemetryToSupabase', () => {
  it('writes private telemetry through the service-role REST boundary', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 201 }));

    await persistClientTelemetryToSupabase(records, {
      supabaseUrl: 'https://project.supabase.co/',
      serviceRoleKey: 'service-secret',
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith(
      'https://project.supabase.co/rest/v1/world_cup_client_telemetry?on_conflict=dedupe_key',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          apikey: 'service-secret',
          Authorization: 'Bearer service-secret',
          Prefer: 'resolution=ignore-duplicates,return=minimal',
        }),
        body: JSON.stringify([{
          schema_version: 1,
          kind: 'web-vital',
          name: 'LCP',
          value: 1_250.5,
          rating: 'good',
          fingerprint: null,
          route: 'world-cup',
          navigation_type: 'navigate',
          received_at: '2026-07-03T12:00:00.000Z',
          dedupe_key: 'sha256:dedupe',
        }]),
      }),
    );
  });

  it('maps runtime errors without raw diagnostic fields', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 201 }));
    await persistClientTelemetryToSupabase([{
      event: {
        schemaVersion: 1,
        kind: 'runtime-error',
        name: 'react-error',
        fingerprint: 'b'.repeat(64),
        route: 'world-cup',
        navigationType: 'unknown',
      },
      receivedAt: '2026-07-03T12:00:00.000Z',
      dedupeKey: 'sha256:error',
    }], {
      supabaseUrl: 'https://project.supabase.co',
      serviceRoleKey: 'service-secret',
      fetcher,
    });

    const request = fetcher.mock.calls[0]?.[1];
    expect(request?.body).toBe(JSON.stringify([{
      schema_version: 1,
      kind: 'runtime-error',
      name: 'react-error',
      value: null,
      rating: null,
      fingerprint: 'b'.repeat(64),
      route: 'world-cup',
      navigation_type: 'unknown',
      received_at: '2026-07-03T12:00:00.000Z',
      dedupe_key: 'sha256:error',
    }]));
    expect(request?.body).not.toContain('message');
    expect(request?.body).not.toContain('stack');
  });

  it('does not issue a request for an empty batch', async () => {
    const fetcher = vi.fn();
    await persistClientTelemetryToSupabase([], {
      supabaseUrl: 'https://project.supabase.co',
      serviceRoleKey: 'service-secret',
      fetcher,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects invalid server configuration before making a request', async () => {
    await expect(persistClientTelemetryToSupabase(records, {
      supabaseUrl: 'http://insecure.test',
      serviceRoleKey: '',
    })).rejects.toThrow('Client telemetry persistence is not configured.');
  });

  it('sanitizes Supabase response details', async () => {
    await expect(persistClientTelemetryToSupabase(records, {
      supabaseUrl: 'https://project.supabase.co',
      serviceRoleKey: 'service-secret',
      fetcher: async () => new Response('database detail token=secret', { status: 500 }),
    })).rejects.toThrow('Client telemetry persistence failed with status 500.');
  });
});
