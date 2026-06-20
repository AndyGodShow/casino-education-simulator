import type { MatchAdvancedMetricTrust, WorldCupAdvancedMetrics, WorldCupTeam } from '../types';
import { WORLD_CUP_MODEL_CONFIG } from './modelConfig';

const advancedMetricFields = [
  'elo',
  'recentXgFor',
  'recentXgAgainst',
  'squadAvailability',
  'restDays',
  'travelFatigue',
] as const;

const trustScore = {
  high: 1,
  medium: 0.72,
  low: 0.35,
} as const;

const hasNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const roundRatio = (value: number) => Number(value.toFixed(2));

const fieldPath = (side: 'home' | 'away', field: keyof WorldCupAdvancedMetrics) =>
  `${side}.advancedMetricSources.${field}`;

export function buildMatchAdvancedMetricTrust(
  homeTeam: WorldCupTeam,
  awayTeam: WorldCupTeam,
  referenceTimestamp: number,
): MatchAdvancedMetricTrust {
  const sides = [
    { label: 'home', team: homeTeam },
    { label: 'away', team: awayTeam },
  ] as const;
  const missingSourceFields: string[] = [];
  const staleFields: string[] = [];
  const unknownFreshnessFields: string[] = [];
  let availableFields = 0;
  let sourcedFields = 0;
  let highTrustFields = 0;
  let mediumTrustFields = 0;
  let lowTrustFields = 0;
  let trustScoreTotal = 0;

  for (const { label, team } of sides) {
    for (const field of advancedMetricFields) {
      if (!hasNumber(team.advancedMetrics?.[field])) continue;

      availableFields += 1;
      const source = team.advancedMetricSources?.[field];
      const path = fieldPath(label, field);

      if (!source) {
        missingSourceFields.push(path);
        continue;
      }

      sourcedFields += 1;
      trustScoreTotal += trustScore[source.trustLevel];
      if (source.trustLevel === 'high') highTrustFields += 1;
      if (source.trustLevel === 'medium') mediumTrustFields += 1;
      if (source.trustLevel === 'low') lowTrustFields += 1;

      const sourceUpdatedAt = source.lastUpdated ? Date.parse(source.lastUpdated) : NaN;
      if (!Number.isFinite(sourceUpdatedAt) || !Number.isFinite(referenceTimestamp)) {
        unknownFreshnessFields.push(path);
        continue;
      }

      const ageHours = Math.max(0, (referenceTimestamp - sourceUpdatedAt) / 3_600_000);
      if (ageHours > WORLD_CUP_MODEL_CONFIG.reliability.advancedMetricTrustThresholds.staleHours) {
        staleFields.push(path);
      }
    }
  }

  return {
    availableFields,
    sourcedFields,
    highTrustFields,
    mediumTrustFields,
    lowTrustFields,
    missingSourceFields,
    staleFields,
    unknownFreshnessFields,
    averageTrustScore: availableFields === 0 ? 1 : roundRatio(trustScoreTotal / availableFields),
    sourceCoverageRatio: availableFields === 0 ? 1 : roundRatio(sourcedFields / availableFields),
  };
}
