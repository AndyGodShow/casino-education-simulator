import type { BetSelection } from '../types';
import type { PredictionResult } from './scoring';

export type CalibrationBucket = {
  label: string;
  count: number;
  averagePrediction: number;
  actualFrequency: number;
};

export function calculateCalibrationBuckets(results: PredictionResult[]): CalibrationBucket[] {
  const buckets = [0, 0.2, 0.4, 0.6, 0.8].map((start) => ({
    label: `${Math.round(start * 100)}-${Math.round((start + 0.2) * 100)}%`,
    count: 0,
    predictionSum: 0,
    actualSum: 0,
  }));

  for (const result of results) {
    (['home', 'draw', 'away'] as BetSelection[]).forEach((key) => {
      const probability = result.probabilities[key];
      const index = Math.min(4, Math.floor(probability / 0.2));
      buckets[index].count += 1;
      buckets[index].predictionSum += probability;
      buckets[index].actualSum += result.outcome === key ? 1 : 0;
    });
  }

  return buckets.map((bucket) => ({
    label: bucket.label,
    count: bucket.count,
    averagePrediction: bucket.count ? bucket.predictionSum / bucket.count : 0,
    actualFrequency: bucket.count ? bucket.actualSum / bucket.count : 0,
  }));
}
