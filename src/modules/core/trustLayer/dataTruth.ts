export type DataTruthLevel =
  | 'local_seed'
  | 'sample'
  | 'scaffold'
  | 'provider'
  | 'stale'
  | 'live';

export type DataTrustInfo = {
  level: DataTruthLevel;
  confidence: number;
  description: string;
  sourceBreakdown: string[];
};

const TRUTH_LEVEL_CONFIDENCE: Record<DataTruthLevel, number> = {
  local_seed: 0.28,
  sample: 0.42,
  scaffold: 0.22,
  provider: 0.62,
  stale: 0.18,
  live: 0.86,
};

function clampConfidence(confidence: number) {
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
