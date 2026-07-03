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
      stageCoverageDetail: '阶段覆盖 0/7',
      candidateSourceReadinessDetail: '官方候选 0/30 · 阶段 0/2；第三方候选 0/30 · 阶段 0/2',
      nextAction: '等待真实比分进入 domain，或导入官方/已核验 provider 的历史回测样本。',
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
    expect(summary.stageCoverageDetail).toBe('阶段覆盖 1/7（小组赛）');
    expect(summary.calibrationEvidenceDetail).toBe('校准证据不足（非样例 0/30 · 阶段 0/2）');
    expect(summary.nextAction).toBe('替换样例/本地回测，补充官方或已核验 provider 的完赛样本。');
    expect(summary.candidateSourceReadinessDetail)
      .toBe('官方候选 0/30 · 阶段 0/2；第三方候选 0/30 · 阶段 0/2');
    expect(summary.detail).toContain('样例/本地 2');
    expect(summary.detail).toContain('阶段覆盖 1/7（小组赛）');
  });

  it('shows non-sample sample counts when calibration is still insufficient', () => {
    const summary = summarizeWorldCupBacktestQuality(runWorldCupBacktest([
      sample({ matchId: 'official-row', sourceTier: 'official' }),
      sample({ matchId: 'provider-row', sourceTier: 'verified_provider' }),
      sample({ matchId: 'sample-row', sourceTier: 'sample' }),
    ]));

    expect(summary.sourceDetail).toBe('官方 1 · 第三方 1 · 样例/本地 1');
    expect(summary.stageCoverageDetail).toBe('阶段覆盖 1/7（小组赛）');
    expect(summary.calibrationEvidenceDetail).toBe('校准证据不足（非样例 2/30 · 阶段 1/2）');
    expect(summary.nextAction).toBe('继续补充非样例完赛样本：还差 28 条候选、1 个阶段。');
    expect(summary.candidateSourceReadinessDetail)
      .toBe('官方候选 1/30 · 阶段 1/2；第三方候选 1/30 · 阶段 1/2');
    expect(summary.detail).toContain('该摘要来自当前 domain 的已完赛样本');
  });

  it('keeps calibration evidence insufficient when enough samples come from only one stage', () => {
    const summary = summarizeWorldCupBacktestQuality(runWorldCupBacktest(
      Array.from({ length: 30 }, (_, index) => sample({
        matchId: `official-${index}`,
        sourceTier: 'official',
      })),
    ));

    expect(summary.sourceDetail).toBe('官方 30 · 第三方 0 · 样例/本地 0');
    expect(summary.stageCoverageDetail).toBe('阶段覆盖 1/7（小组赛）');
    expect(summary.calibrationEvidenceDetail).toBe('校准证据不足（非样例 30/30 · 阶段 1/2）');
    expect(summary.candidateSourceReadinessDetail)
      .toBe('官方候选 30/30 · 阶段 1/2；第三方候选 0/30 · 阶段 0/2');
  });

  it('marks calibration evidence usable only when sample count and stage coverage both reach the threshold', () => {
    const summary = summarizeWorldCupBacktestQuality(runWorldCupBacktest(
      Array.from({ length: 30 }, (_, index) => sample({
        matchId: `official-${index}`,
        sourceTier: 'official',
        stage: index < 20 ? 'group' : 'final',
      })),
    ));

    expect(summary.sourceDetail).toBe('官方 30 · 第三方 0 · 样例/本地 0');
    expect(summary.stageCoverageDetail).toBe('阶段覆盖 2/7（小组赛、决赛）');
    expect(summary.calibrationEvidenceDetail).toBe('可作为校准候选（非样例 30/30 · 阶段 2/2）');
    expect(summary.nextAction).toBe('官方校准候选已达阈值；继续监控新完赛比赛的 Brier、LogLoss 和阶段漂移。');
    expect(summary.candidateSourceReadinessDetail)
      .toBe('官方候选 30/30 · 阶段 2/2；第三方候选 0/30 · 阶段 0/2');
  });

  it('marks provider-ready calibration as non-official in the quality summary', () => {
    const summary = summarizeWorldCupBacktestQuality(runWorldCupBacktest(
      Array.from({ length: 30 }, (_, index) => sample({
        matchId: `provider-${index}`,
        sourceTier: 'verified_provider',
        stage: index < 20 ? 'group' : 'final',
      })),
    ));

    expect(summary.sourceDetail).toBe('官方 0 · 第三方 30 · 样例/本地 0');
    expect(summary.calibrationEvidenceDetail).toBe('可作为校准候选（非样例 30/30 · 阶段 2/2）');
    expect(summary.nextAction).toBe('第三方候选已达阈值；下一步补充官方样本，避免把 provider-ready 当作 official-ready。');
    expect(summary.candidateSourceReadinessDetail)
      .toBe('官方候选 0/30 · 阶段 0/2；第三方候选 30/30 · 阶段 2/2（第三方不等同官方）');
    expect(summary.detail).toContain('第三方不等同官方');
  });

  it('keeps mixed calibration readiness labelled when no source is individually ready', () => {
    const summary = summarizeWorldCupBacktestQuality(runWorldCupBacktest([
      ...Array.from({ length: 29 }, (_, index) => sample({
        matchId: `provider-${index}`,
        sourceTier: 'verified_provider',
        stage: 'group',
      })),
      sample({ matchId: 'official-final', sourceTier: 'official', stage: 'final' }),
    ]));

    expect(summary.sourceDetail).toBe('官方 1 · 第三方 29 · 样例/本地 0');
    expect(summary.calibrationEvidenceDetail).toBe('可作为校准候选（非样例 30/30 · 阶段 2/2）');
    expect(summary.nextAction).toBe('合并候选已达阈值；继续补官方样本，并保留第三方 provider 来源标签。');
    expect(summary.candidateSourceReadinessDetail)
      .toBe('官方候选 1/30 · 阶段 1/2；第三方候选 29/30 · 阶段 1/2；合并候选需保留来源标签');
    expect(summary.detail).toContain('合并候选需保留来源标签');
  });

  it('summarizes multi-stage coverage without implying accuracy generalizes across the tournament', () => {
    const summary = summarizeWorldCupBacktestQuality(runWorldCupBacktest([
      sample({ matchId: 'group-row', stage: 'group' }),
      sample({ matchId: 'round16-row', stage: 'round16' }),
      sample({ matchId: 'final-row', stage: 'final' }),
    ]));

    expect(summary.stageCoverageDetail).toBe('阶段覆盖 3/7（小组赛、16 强、决赛）');
    expect(summary.detail).toContain('阶段覆盖 3/7');
  });
});
