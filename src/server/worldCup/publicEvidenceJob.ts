import type { PublicWorldCupSnapshot } from '../../modules/sports/football/worldCup/data/publicWorldCupSnapshot';
import { buildWorldCupDomain } from '../../modules/sports/football/worldCup/domain/buildWorldCupDomain';
import { capturePreMatchPredictionSnapshots } from '../../modules/sports/football/worldCup/persistence/preMatchPredictionStore';
import type { PreMatchPredictionSnapshot } from '../../modules/sports/football/worldCup/types';
import { loadPublicWorldCupSnapshot } from './publicDataEndpoint';
import type { PublicEvidenceRecord } from './publicEvidenceRepository';

type PublicWorldCupEvidenceJobDependencies = {
  loadSnapshot?: () => Promise<PublicWorldCupSnapshot>;
  persistEvidence: (records: PublicEvidenceRecord[]) => Promise<void>;
  persistSnapshots: (snapshots: PreMatchPredictionSnapshot[]) => Promise<void>;
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => [key, canonicalize(child)]),
  );
};

const sha256 = async (value: unknown) => {
  const serialized = JSON.stringify(canonicalize(value));
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized)),
  );
  return `sha256:${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};

export async function buildPublicEvidenceRecords(
  snapshot: PublicWorldCupSnapshot,
): Promise<PublicEvidenceRecord[]> {
  const fixturePayload = {
    adapterResult: snapshot.adapterResult,
    provenance: snapshot.provenance.fixture,
  };
  const fixtureRecord: PublicEvidenceRecord = {
    kind: 'fixture',
    contentHash: await sha256({ kind: 'fixture', payload: fixturePayload }),
    matchId: null,
    source: snapshot.adapterResult.source,
    capturedAt: snapshot.generatedAt,
    sourceUpdatedAt: null,
    schemaVersion: snapshot.schemaVersion,
    payload: fixturePayload,
  };
  const marketRecords = await Promise.all(
    Object.entries(snapshot.markets).map(async ([matchId, market]) => {
      const payload = {
        matchId,
        market,
        provenance: snapshot.provenance.market,
      };
      return {
        kind: 'market' as const,
        contentHash: await sha256({ kind: 'market', payload }),
        matchId,
        source: market.source ?? 'provider',
        capturedAt: snapshot.generatedAt,
        sourceUpdatedAt: market.lastUpdated ?? null,
        schemaVersion: snapshot.schemaVersion,
        payload,
      };
    }),
  );

  return [fixtureRecord, ...marketRecords];
}

export async function runPublicWorldCupEvidenceJob(
  dependencies: PublicWorldCupEvidenceJobDependencies,
) {
  const snapshot = await (dependencies.loadSnapshot ?? loadPublicWorldCupSnapshot)();
  const evidence = await buildPublicEvidenceRecords(snapshot);
  await dependencies.persistEvidence(evidence);

  const evaluationTimeMs = Date.parse(snapshot.generatedAt);
  const domain = buildWorldCupDomain({
    ...snapshot.adapterResult,
    markets: snapshot.markets,
  }, {
    evaluationTimeMs,
  });
  const captured = capturePreMatchPredictionSnapshots({
    snapshots: {},
    matches: domain.matches,
    predictions: domain.predictions,
    now: evaluationTimeMs,
  });
  const predictionSnapshots = Object.values(captured.snapshots);
  if (predictionSnapshots.length > 0) {
    await dependencies.persistSnapshots(predictionSnapshots);
  }

  return {
    source: snapshot.adapterResult.source,
    evidenceWritten: evidence.length,
    written: predictionSnapshots.length,
  };
}
