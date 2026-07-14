import type { PublicWorldCupSnapshot } from '../../modules/sports/football/worldCup/data/publicWorldCupSnapshot';
import { buildWorldCupDomain } from '../../modules/sports/football/worldCup/domain/buildWorldCupDomain';
import type { WorldCupStrategyResearchState } from '../../modules/sports/football/worldCup/domain/WorldCupDomainModel';
import {
  capturePreMatchPredictionSnapshots,
  preMatchPredictionProvenanceForCapture,
} from '../../modules/sports/football/worldCup/persistence/preMatchPredictionStore';
import { applyStrategyTeamRatings } from '../../modules/sports/football/worldCup/research/applyStrategyTeamRatings';
import type { PreMatchPredictionSnapshot } from '../../modules/sports/football/worldCup/types';
import { loadPublicWorldCupSnapshot } from './publicDataEndpoint';
import type { PublicEvidenceRecord } from './publicEvidenceRepository';

type PublicWorldCupEvidenceJobDependencies = {
  loadSnapshot?: () => Promise<PublicWorldCupSnapshot>;
  loadStrategyResearch?: () => Promise<WorldCupStrategyResearchState>;
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
  const fixtureIdentity = {
    kind: 'fixture',
    adapterResult: snapshot.adapterResult,
    source: snapshot.provenance.fixture.source,
    providerName: snapshot.provenance.fixture.providerName,
  };
  const fixtureRecord: PublicEvidenceRecord = {
    kind: 'fixture',
    contentHash: await sha256(fixtureIdentity),
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
      const identity = {
        kind: 'market',
        matchId,
        market,
        source: snapshot.provenance.market.source,
        matchedMatches: snapshot.provenance.market.matchedMatches,
      };
      return {
        kind: 'market' as const,
        contentHash: await sha256(identity),
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
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: { VERCEL_GIT_COMMIT_SHA?: string } };
  };
  const applicationRevision = runtime.process?.env?.VERCEL_GIT_COMMIT_SHA ?? 'local';
  const snapshot = await (dependencies.loadSnapshot ?? loadPublicWorldCupSnapshot)();
  const evidence = await buildPublicEvidenceRecords(snapshot);
  await dependencies.persistEvidence(evidence);

  let strategyResearch: WorldCupStrategyResearchState | undefined;
  if (dependencies.loadStrategyResearch) {
    try {
      strategyResearch = await dependencies.loadStrategyResearch();
    } catch {
      return {
        source: snapshot.adapterResult.source,
        evidenceWritten: evidence.length,
        written: 0,
        predictionInput: 'skipped_research_unavailable' as const,
      };
    }
    if (strategyResearch.status === 'unavailable') {
      return {
        source: snapshot.adapterResult.source,
        evidenceWritten: evidence.length,
        written: 0,
        predictionInput: 'skipped_research_unavailable' as const,
      };
    }
  }

  const evaluationTimeMs = Date.parse(snapshot.generatedAt);
  const strategyInputs = strategyResearch
    ? applyStrategyTeamRatings(snapshot.adapterResult, strategyResearch)
    : null;
  const domain = buildWorldCupDomain({
    ...(strategyInputs?.adapterResult ?? snapshot.adapterResult),
    markets: snapshot.markets,
  }, {
    evaluationTimeMs,
    strategyResearch: strategyInputs?.strategyResearch,
  });
  const captured = capturePreMatchPredictionSnapshots({
    snapshots: {},
    matches: domain.matches,
    predictions: domain.predictions,
    now: evaluationTimeMs,
    provenance: preMatchPredictionProvenanceForCapture(
      applicationRevision,
      strategyInputs
        ? {
            appliedTeams: strategyInputs.strategyResearch.ratingInputAudit?.appliedTeams ?? 0,
            researchGeneratedAt: strategyInputs.strategyResearch.generatedAt,
            candidateId: strategyInputs.strategyResearch.candidateId,
            provenance: strategyInputs.strategyResearch.provenance,
          }
        : undefined,
    ),
  });
  const predictionSnapshots = Object.values(captured.snapshots);
  if (predictionSnapshots.length > 0) {
    await dependencies.persistSnapshots(predictionSnapshots);
  }

  return {
    source: snapshot.adapterResult.source,
    evidenceWritten: evidence.length,
    written: predictionSnapshots.length,
    predictionInput: strategyInputs?.strategyResearch.ratingInputAudit?.appliedTeams
      ? 'historical_elo' as const
      : 'baseline' as const,
  };
}
