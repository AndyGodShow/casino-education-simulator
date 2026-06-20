import { describe, expect, it } from 'vitest';
import type { WorldCupBacktestSample } from './types';
import { runCombinedWorldCupBacktest } from './combinedBacktest';
import { runHistoricalWorldCupBacktestFromCsv } from './historicalBacktest';

const sample = (
  overrides: Partial<WorldCupBacktestSample>,
): WorldCupBacktestSample => ({
  matchId: 'match-1',
  stage: 'group',
  sourceTier: 'official',
  rawConfidence: 0.72,
  adjustedConfidence: 0.62,
  probabilities: {
    home: 0.6,
    draw: 0.25,
    away: 0.15,
  },
  outcome: 'home',
  ...overrides,
});

describe('runCombinedWorldCupBacktest', () => {
  it('combines current-domain and historical samples with origin audit', () => {
    const run = runCombinedWorldCupBacktest({
      currentDomainSamples: [
        sample({
          matchId: 'current-official',
          sourceTier: 'official',
          adjustedConfidence: 0.71,
        }),
      ],
      historicalSamples: [
        sample({
          matchId: 'historical-provider',
          sourceTier: 'verified_provider',
          probabilities: {
            home: 0.2,
            draw: 0.25,
            away: 0.55,
          },
          outcome: 'away',
        }),
        sample({
          matchId: 'historical-sample',
          sourceTier: 'sample',
          probabilities: {
            home: 0.2,
            draw: 0.25,
            away: 0.55,
          },
          outcome: 'away',
        }),
      ],
    });

    expect(run.samples.map((backtestSample) => backtestSample.matchId)).toEqual([
      'current-official',
      'historical-provider',
      'historical-sample',
    ]);
    expect(run.report.overall.sampleSize).toBe(3);
    expect(run.report.quality.sourceCoverage).toEqual({
      official: { count: 1, coverage: 0.333333 },
      verified_provider: { count: 1, coverage: 0.333333 },
      sample: { count: 1, coverage: 0.333333 },
      local: { count: 0, coverage: 0 },
    });
    expect(run.report.quality.nonSample.sampleSize).toBe(2);
    expect(run.report.quality.sampleOrLocal.sampleSize).toBe(1);
    expect(run.audit.currentDomain).toEqual(expect.objectContaining({
      inputSamples: 1,
      acceptedSamples: 1,
      rejectedDuplicateSamples: 0,
      calibrationCandidateSamples: 1,
    }));
    expect(run.audit.historicalImport).toEqual(expect.objectContaining({
      inputSamples: 2,
      acceptedSamples: 2,
      rejectedDuplicateSamples: 0,
      calibrationCandidateSamples: 1,
    }));
    expect(run.audit.message).toContain('样例/本地数据保留来源标签');
  });

  it('keeps current-domain samples when historical import repeats a match id', () => {
    const run = runCombinedWorldCupBacktest({
      currentDomainSamples: [
        sample({
          matchId: 'same-match',
          sourceTier: 'official',
          probabilities: {
            home: 0.62,
            draw: 0.22,
            away: 0.16,
          },
          outcome: 'home',
        }),
      ],
      historicalSamples: [
        sample({
          matchId: 'same-match',
          sourceTier: 'verified_provider',
          probabilities: {
            home: 0.16,
            draw: 0.22,
            away: 0.62,
          },
          outcome: 'away',
        }),
      ],
    });

    expect(run.samples).toEqual([
      expect.objectContaining({
        matchId: 'same-match',
        sourceTier: 'official',
        outcome: 'home',
      }),
    ]);
    expect(run.audit).toEqual(expect.objectContaining({
      inputSamples: 2,
      acceptedSamples: 1,
      rejectedDuplicateSamples: 1,
      duplicateMatchIds: ['same-match'],
    }));
    expect(run.audit.historicalImport.rejectedDuplicateSamples).toBe(1);
    expect(run.audit.message).toContain('当前 domain 样本优先');
  });

  it('does not claim current-domain priority for duplicates inside historical imports only', () => {
    const run = runCombinedWorldCupBacktest({
      historicalSamples: [
        sample({
          matchId: 'historical-duplicate',
          sourceTier: 'verified_provider',
          outcome: 'home',
        }),
        sample({
          matchId: 'historical-duplicate',
          sourceTier: 'verified_provider',
          outcome: 'away',
        }),
      ],
    });

    expect(run.samples).toEqual([
      expect.objectContaining({
        matchId: 'historical-duplicate',
        outcome: 'home',
      }),
    ]);
    expect(run.audit).toEqual(expect.objectContaining({
      acceptedSamples: 1,
      rejectedDuplicateSamples: 1,
      duplicateMatchIds: ['historical-duplicate'],
    }));
    expect(run.audit.message).toContain('保留先出现的样本');
    expect(run.audit.message).not.toContain('当前 domain 样本优先');
  });

  it('combines historical CSV imports without letting sample or local rows count as calibration evidence', () => {
    const historical = runHistoricalWorldCupBacktestFromCsv([
      'match_id,stage,source_tier,raw_confidence,home_win,draw,away_win,home_score,away_score',
      'historical-sample,group,sample,0.72,55,25,20,2,1',
      'historical-local,final,local,0.58,20,25,55,0,1',
    ].join('\n'));

    const run = runCombinedWorldCupBacktest({
      historicalSamples: historical.dataset.samples,
    });

    expect(historical.dataset.audit.rejectedRows).toBe(0);
    expect(run.report.overall.sampleSize).toBe(2);
    expect(run.report.quality.sourceCoverage).toEqual({
      official: { count: 0, coverage: 0 },
      verified_provider: { count: 0, coverage: 0 },
      sample: { count: 1, coverage: 0.5 },
      local: { count: 1, coverage: 0.5 },
    });
    expect(run.report.quality.calibrationUsability).toEqual(expect.objectContaining({
      status: 'sample_or_local_only',
      canUseForCalibration: false,
      sampleSize: 0,
    }));
    expect(run.audit.historicalImport.calibrationCandidateSamples).toBe(0);
  });
});
