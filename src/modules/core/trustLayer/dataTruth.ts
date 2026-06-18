export type DataTruthLevel =
  | 'local_seed'
  | 'sample'
  | 'scaffold'
  | 'stale'
  | 'live';

export type DataTrustInfo = {
  level: DataTruthLevel;
  confidence: number;
  description: string;
  sourceBreakdown: string[];
};

export const TRUTH_LEVEL_LABELS: Record<DataTruthLevel, string> = {
  local_seed: 'LOCAL SEED',
  sample: 'SAMPLE DATA',
  scaffold: 'SCATTERED PROVIDER',
  stale: 'STALE',
  live: 'LIVE',
};

export const TRUTH_LEVEL_CONFIDENCE: Record<DataTruthLevel, number> = {
  local_seed: 0.28,
  sample: 0.42,
  scaffold: 0.22,
  stale: 0.18,
  live: 0.86,
};

export function clampConfidence(confidence: number) {
  if (!Number.isFinite(confidence)) return 0;
  return Math.min(1, Math.max(0, confidence));
}

export function createDataTrustInfo(
  level: DataTruthLevel,
  description: string,
  sourceBreakdown: string[],
  confidence = TRUTH_LEVEL_CONFIDENCE[level],
): DataTrustInfo {
  return {
    level,
    confidence: clampConfidence(confidence),
    description,
    sourceBreakdown: sourceBreakdown.filter(Boolean),
  };
}
