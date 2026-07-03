import type { MarketData } from '../domain/WorldCupDomainModel';
import type {
  MatchExternalIntelligenceInput,
  WorldCupMatch,
  WorldCupTeam,
} from '../types';

export const PUBLIC_WORLD_CUP_SNAPSHOT_SCHEMA_VERSION = 1;
export const PUBLIC_WORLD_CUP_MAX_MATCHES = 104;

export type PublicWorldCupAdapterResult = {
  matches: WorldCupMatch[];
  teams: Record<string, WorldCupTeam>;
  matchIntelligence?: Record<string, MatchExternalIntelligenceInput>;
  source: WorldCupMatch['source'];
  providerName: string;
  errors: string[];
  meta: {
    totalMatches: number;
    statusBreakdown: Record<'scheduled' | 'live' | 'finished', number>;
  };
};

export type PublicWorldCupSnapshot = {
  schemaVersion: typeof PUBLIC_WORLD_CUP_SNAPSHOT_SCHEMA_VERSION;
  generatedAt: string;
  adapterResult: PublicWorldCupAdapterResult;
  markets: Record<string, MarketData>;
  provenance: {
    delivery: 'server';
    fixture: {
      source: WorldCupMatch['source'];
      providerName: string;
      retrievedAt: string;
    };
    market: {
      source: 'polymarket';
      retrievedAt: string;
      matchedMatches: number;
    };
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isVerifiedSource = (value: unknown): value is PublicWorldCupAdapterResult['source'] =>
  value === 'official'
  || value === 'real'
  || value === 'openfootball'
  || value === 'api-football'
  || value === 'sportmonks';

export function parsePublicWorldCupSnapshot(value: unknown): PublicWorldCupSnapshot | null {
  if (!isRecord(value) || value.schemaVersion !== PUBLIC_WORLD_CUP_SNAPSHOT_SCHEMA_VERSION) return null;
  if (typeof value.generatedAt !== 'string' || !Number.isFinite(Date.parse(value.generatedAt))) return null;
  if (!isRecord(value.adapterResult) || !isRecord(value.provenance) || !isRecord(value.markets)) return null;

  const adapterResult = value.adapterResult;
  if (
    !Array.isArray(adapterResult.matches)
    || adapterResult.matches.length === 0
    || adapterResult.matches.length > PUBLIC_WORLD_CUP_MAX_MATCHES
    || !isRecord(adapterResult.teams)
    || !isVerifiedSource(adapterResult.source)
    || typeof adapterResult.providerName !== 'string'
    || !Array.isArray(adapterResult.errors)
    || !isRecord(adapterResult.meta)
  ) {
    return null;
  }

  const provenance = value.provenance;
  if (
    provenance.delivery !== 'server'
    || !isRecord(provenance.fixture)
    || !isRecord(provenance.market)
    || provenance.market.source !== 'polymarket'
  ) {
    return null;
  }

  return value as PublicWorldCupSnapshot;
}

