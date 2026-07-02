import { describe, expect, it, vi } from 'vitest';
import {
  persistPublicEvidenceToSupabase,
  type PublicEvidenceRecord,
} from './publicEvidenceRepository';

const evidence: PublicEvidenceRecord[] = [{
  kind: 'fixture',
  contentHash: 'sha256:fixture',
  matchId: null,
  source: 'openfootball',
  capturedAt: '2026-07-02T12:00:00.000Z',
  sourceUpdatedAt: null,
  schemaVersion: 1,
  payload: { matches: 104 },
}];

describe('persistPublicEvidenceToSupabase', () => {
  it('appends evidence through the service-role REST boundary', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 201 }));

    await persistPublicEvidenceToSupabase(evidence, {
      supabaseUrl: 'https://project.supabase.co/',
      serviceRoleKey: 'service-secret',
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith(
      'https://project.supabase.co/rest/v1/world_cup_public_evidence?on_conflict=kind%2Ccontent_hash',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          apikey: 'service-secret',
          authorization: 'Bearer service-secret',
          prefer: 'resolution=ignore-duplicates,return=minimal',
        }),
        body: JSON.stringify([{
          kind: 'fixture',
          content_hash: 'sha256:fixture',
          match_id: null,
          source: 'openfootball',
          captured_at: '2026-07-02T12:00:00.000Z',
          source_updated_at: null,
          schema_version: 1,
          payload: { matches: 104 },
        }]),
      }),
    );
  });

  it('does not issue a request for an empty evidence batch', async () => {
    const fetcher = vi.fn();
    await persistPublicEvidenceToSupabase([], {
      supabaseUrl: 'https://project.supabase.co',
      serviceRoleKey: 'service-secret',
      fetcher,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects invalid server configuration before making a request', async () => {
    await expect(persistPublicEvidenceToSupabase(evidence, {
      supabaseUrl: 'http://insecure.test',
      serviceRoleKey: '',
    })).rejects.toThrow('Public evidence persistence is not configured.');
  });

  it('sanitizes Supabase response details', async () => {
    await expect(persistPublicEvidenceToSupabase(evidence, {
      supabaseUrl: 'https://project.supabase.co',
      serviceRoleKey: 'service-secret',
      fetcher: async () => new Response('database detail token=secret', { status: 500 }),
    })).rejects.toThrow('Public evidence persistence failed with status 500.');
  });
});
