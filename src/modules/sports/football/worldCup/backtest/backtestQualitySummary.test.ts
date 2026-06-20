import { describe, expect, it } from 'vitest';
import type { WorldCupBacktestSample } from './types';
import { summarizeWorldCupBacktestQuality } from './backtestQualitySummary';
import { runWorldCupBacktest } from './worldCupBacktest';

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

describe('summarizeWorldCupBacktestQuality', () => {
  it('summarizes empty reports without implying calibration evidence', () => {
    const summary = summarizeWorldCupBacktestQuality(runWorldCupBacktest([]));

    expect(summary).toEqual({
      label: '暂无回测样本',
      detail: '暂无已完赛且带模型预测的样本；回测会在真实比分进入 domain 后自动汇总。',
      sourceDetail: '官方 0 · 第三方 0 · 样例/本地 0',
      calibrationEvidenceDetail: '校准证据不足',
      highConfidenceDetail: '降权后高自信 0 场',
    });
  });

  it('keeps sample and local backtests visible but unusable for calibration', () => {
    const summary = summarizeWorldCupBacktestQuality(runWorldCupBacktest([
      sample({ matchId: 'sample-row', sourceTier: 'sample', adjustedConfidence: 0.72 }),
      sample({ matchId: 'local-row', sourceTier: 'local', adjustedConfidence: 0.41 }),
    ]));

    expect(summary.label).toBe('样本 2');
    expect(summary.sourceDetail).toBe('官方 0 · 第三方 0 · 样例/本地 2');
    expect(summary.highConfidenceDetail).toBe('降权后高自信 1 场');
    expect(summary.calibrationEvidenceDetail).toBe('校准证据不足（非样例 0/30）');
    expect(summary.detail).toContain('样例/本地 2');
  });

  it('shows non-sample sample counts when calibration is still insufficient', () => {
    const summary = summarizeWorldCupBacktestQuality(runWorldCupBacktest([
      sample({ matchId: 'official-row', sourceTier: 'official' }),
      sample({ matchId: 'provider-row', sourceTier: 'verified_provider' }),
      sample({ matchId: 'sample-row', sourceTier: 'sample' }),
    ]));

    expect(summary.sourceDetail).toBe('官方 1 · 第三方 1 · 样例/本地 1');
    expect(summary.calibrationEvidenceDetail).toBe('校准证据不足（非样例 2/30）');
    expect(summary.detail).toContain('该摘要来自当前 domain 的已完赛样本');
  });

  it('marks calibration evidence usable only when non-sample samples reach the threshold', () => {
    const summary = summarizeWorldCupBacktestQuality(runWorldCupBacktest(
      Array.from({ length: 30 }, (_, index) => sample({
        matchId: `official-${index}`,
        sourceTier: 'official',
      })),
    ));

    expect(summary.sourceDetail).toBe('官方 30 · 第三方 0 · 样例/本地 0');
    expect(summary.calibrationEvidenceDetail).toBe('可作为校准候选（非样例 30/30）');
  });
});
