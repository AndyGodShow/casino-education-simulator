import { describe, expect, it } from 'vitest';
import type { WorldCupBacktestSample } from './types';
import { runCombinedWorldCupCalibration } from './combinedCalibration';
import { summarizeCombinedWorldCupCalibration } from './combinedAuditSummary';
import { runHistoricalWorldCupBacktestFromCsv, summarizeHistoricalBacktestImport } from './historicalBacktest';

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

describe('summarizeCombinedWorldCupCalibration', () => {
  it('marks empty combined runs as lacking backtest evidence', () => {
    const run = runCombinedWorldCupCalibration({});
    const summary = summarizeCombinedWorldCupCalibration(run);

    expect(summary).toEqual(expect.objectContaining({
      status: 'empty',
      evidenceGrade: 'empty',
      label: '暂无合并回测样本 · 合并后样本 0',
      candidateDetail: '校准候选 0/30 · 阶段 0/2（当前 domain 0 · 历史导入 0）',
      candidateSourceDetail: '候选来源：官方 0 · 第三方 0',
      candidateSourceReadinessDetail: '来源 readiness：官方候选 0/30 · 阶段 0/2；第三方候选 0/30 · 阶段 0/2',
      evidenceDetail: '校准证据不足',
      provenanceDetail: '官方 0 · 第三方 0 · 样例/本地 0；样例/本地排除 0',
      duplicateDetail: '合并拒绝重复 0',
    }));
    expect(summary.detail).toContain('暂无可用于合并校准的非样例回测样本');
    expect(summary.detail).not.toContain('。。');
  });

  it('keeps sample and local rows visible but excluded from calibration evidence', () => {
    const run = runCombinedWorldCupCalibration({
      historicalSamples: [
        sample({ matchId: 'sample-row', sourceTier: 'sample' }),
        sample({ matchId: 'local-row', sourceTier: 'local' }),
      ],
    });
    const summary = summarizeCombinedWorldCupCalibration(run);

    expect(summary.status).toBe('sample_or_local_only');
    expect(summary.evidenceGrade).toBe('sample_or_local_only');
    expect(summary.label).toBe('仅样例/本地回测 · 合并后样本 2');
    expect(summary.detail).toContain('校准候选 0/30 · 阶段 0/2');
    expect(summary.detail).toContain('候选来源：官方 0 · 第三方 0');
    expect(summary.detail).toContain('来源 readiness：官方候选 0/30 · 阶段 0/2；第三方候选 0/30 · 阶段 0/2');
    expect(summary.detail).toContain('官方 0 · 第三方 0 · 样例/本地 2');
    expect(summary.detail).toContain('样例/本地排除 2');
    expect(summary.detail).toContain('不能作为真实校准证据');
    expect(summary.detail).not.toContain('。。');
  });

  it('summarizes imported historical rows without upgrading providers to official evidence', () => {
    const historical = runHistoricalWorldCupBacktestFromCsv([
      'match_id,stage,source_tier,raw_confidence,home_win,draw,away_win,home_score,away_score',
      'provider-one,group,verified_provider,0.72,55,25,20,2,1',
      'sample-one,group,sample,0.58,20,25,55,0,1',
      'too-short,group,official,0.58,20,25,55',
      'provider-one,group,verified_provider,0.61,20,25,55,0,1',
    ].join('\n'));
    const importSummary = summarizeHistoricalBacktestImport(historical);
    const run = runCombinedWorldCupCalibration({
      currentDomainSamples: [
        sample({
          matchId: 'current-official',
          sourceTier: 'official',
        }),
      ],
      historicalSamples: historical.dataset.samples,
    });

    const summary = summarizeCombinedWorldCupCalibration(run, importSummary);

    expect(summary.status).toBe('insufficient_candidates');
    expect(summary.evidenceGrade).toBe('insufficient');
    expect(summary.label).toBe('合并校准样本不足 · 合并后样本 3');
    expect(summary.importDetail).toContain('导入接收 2 · 拒绝 2');
    expect(summary.importDetail).toContain('CSV 列数不匹配 1');
    expect(summary.importDetail).toContain('重复比赛 ID 1');
    expect(summary.candidateDetail).toBe('校准候选 2/30 · 阶段 1/2（当前 domain 1 · 历史导入 1）');
    expect(summary.candidateSourceDetail).toBe('候选来源：官方 1 · 第三方 1');
    expect(summary.candidateSourceReadinessDetail)
      .toBe('来源 readiness：官方候选 1/30 · 阶段 1/2；第三方候选 1/30 · 阶段 1/2');
    expect(summary.provenanceDetail).toBe('官方 1 · 第三方 1 · 样例/本地 1；样例/本地排除 1');
    expect(summary.evidenceDetail).toBe('校准证据不足');
    expect(summary.detail).not.toContain('合并校准可用');
  });

  it('surfaces duplicate match ids when current domain samples take priority', () => {
    const run = runCombinedWorldCupCalibration({
      currentDomainSamples: [
        sample({
          matchId: 'same-match',
          sourceTier: 'official',
        }),
      ],
      historicalSamples: [
        sample({
          matchId: 'same-match',
          sourceTier: 'verified_provider',
          outcome: 'away',
        }),
      ],
    });
    const summary = summarizeCombinedWorldCupCalibration(run);

    expect(summary.duplicateDetail).toBe('合并拒绝重复 1（same-match）');
    expect(summary.detail).toContain('当前 domain 样本优先');
    expect(summary.detail).toContain('校准候选 1/30 · 阶段 1/2');
  });

  it('keeps provider-backed ready calibration distinct from official-only readiness', () => {
    const run = runCombinedWorldCupCalibration({
      historicalSamples: Array.from({ length: 30 }, (_, index) => sample({
        matchId: `provider-ready-${index}`,
        stage: index < 20 ? 'group' : 'final',
        sourceTier: 'verified_provider',
        probabilities: {
          home: 0.2,
          draw: 0.25,
          away: 0.55,
        },
        outcome: 'away',
      })),
    });
    const summary = summarizeCombinedWorldCupCalibration(run);

    expect(summary.status).toBe('ready');
    expect(summary.evidenceGrade).toBe('provider_ready');
    expect(summary.label).toBe('合并校准可用 · 合并后样本 30');
    expect(summary.candidateSourceDetail).toBe('候选来源：官方 0 · 第三方 30');
    expect(summary.candidateSourceReadinessDetail)
      .toBe('来源 readiness：官方候选 0/30 · 阶段 0/2；第三方候选 30/30 · 阶段 2/2（第三方不等同官方）');
    expect(summary.evidenceDetail).toBe('第三方候选充足，但不等同官方校准证据');
    expect(summary.nextAction).toContain('补充官方');
    expect(summary.detail).not.toContain('官方校准候选充足');
    expect(summary.detail).not.toContain('。。');
  });

  it('keeps enough same-stage provider samples below ready calibration evidence', () => {
    const run = runCombinedWorldCupCalibration({
      historicalSamples: Array.from({ length: 30 }, (_, index) => sample({
        matchId: `provider-single-stage-${index}`,
        sourceTier: 'verified_provider',
      })),
    });
    const summary = summarizeCombinedWorldCupCalibration(run);

    expect(summary.status).toBe('insufficient_candidates');
    expect(summary.evidenceGrade).toBe('insufficient');
    expect(summary.label).toBe('合并校准样本不足 · 合并后样本 30');
    expect(summary.nextAction).toContain('还差 0 条候选、1 个阶段');
    expect(summary.candidateSourceReadinessDetail)
      .toBe('来源 readiness：官方候选 0/30 · 阶段 0/2；第三方候选 30/30 · 阶段 1/2');
    expect(summary.detail).toContain('阶段覆盖不足');
  });

  it('does not mark a single-stage official source as official-ready when only merged evidence is ready', () => {
    const run = runCombinedWorldCupCalibration({
      currentDomainSamples: Array.from({ length: 30 }, (_, index) => sample({
        matchId: `official-single-stage-${index}`,
        sourceTier: 'official',
        stage: 'group',
      })),
      historicalSamples: [
        sample({
          matchId: 'provider-final',
          sourceTier: 'verified_provider',
          stage: 'final',
        }),
      ],
    });
    const summary = summarizeCombinedWorldCupCalibration(run);

    expect(summary.status).toBe('ready');
    expect(summary.evidenceGrade).toBe('mixed_ready');
    expect(summary.evidenceDetail).toBe('可作为合并校准候选，第三方 provider 仍保留来源标签');
    expect(summary.candidateDetail).toBe('校准候选 31/30 · 阶段 2/2（当前 domain 30 · 历史导入 1）');
    expect(summary.candidateSourceDetail).toBe('候选来源：官方 30 · 第三方 1');
    expect(summary.candidateSourceReadinessDetail)
      .toBe('来源 readiness：官方候选 30/30 · 阶段 1/2；第三方候选 1/30 · 阶段 1/2；合并候选需保留来源标签');
    expect(summary.detail).not.toContain('官方校准候选充足');
  });

  it('distinguishes official-ready and mixed-ready calibration evidence', () => {
    const officialReady = summarizeCombinedWorldCupCalibration(runCombinedWorldCupCalibration({
      historicalSamples: Array.from({ length: 30 }, (_, index) => sample({
        matchId: `official-ready-${index}`,
        stage: index < 20 ? 'group' : 'final',
        sourceTier: 'official',
      })),
    }));
    const mixedReady = summarizeCombinedWorldCupCalibration(runCombinedWorldCupCalibration({
      currentDomainSamples: [
        sample({
          matchId: 'current-official',
          sourceTier: 'official',
        }),
      ],
      historicalSamples: Array.from({ length: 29 }, (_, index) => sample({
        matchId: `provider-mixed-${index}`,
        stage: index < 20 ? 'group' : 'final',
        sourceTier: 'verified_provider',
      })),
    }));

    expect(officialReady.evidenceGrade).toBe('official_ready');
    expect(officialReady.evidenceDetail).toBe('官方校准候选充足');
    expect(officialReady.candidateSourceReadinessDetail)
      .toBe('来源 readiness：官方候选 30/30 · 阶段 2/2；第三方候选 0/30 · 阶段 0/2');
    expect(mixedReady.evidenceGrade).toBe('mixed_ready');
    expect(mixedReady.evidenceDetail).toBe('可作为合并校准候选，第三方 provider 仍保留来源标签');
    expect(mixedReady.nextAction).toContain('继续补官方样本');
    expect(mixedReady.candidateSourceDetail).toBe('候选来源：官方 1 · 第三方 29');
    expect(mixedReady.candidateSourceReadinessDetail)
      .toBe('来源 readiness：官方候选 1/30 · 阶段 1/2；第三方候选 29/30 · 阶段 2/2；合并候选需保留来源标签');
  });
});
