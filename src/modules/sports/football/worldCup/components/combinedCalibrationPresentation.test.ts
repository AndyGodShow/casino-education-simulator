import { describe, expect, it } from 'vitest';
import type { WorldCupDomainModel } from '../domain/WorldCupDomainModel';
import { runHistoricalWorldCupBacktestFromCsv, runWorldCupBacktest } from '../backtest';
import { buildCombinedCalibrationPresentation } from './combinedCalibrationPresentation';

const baseDomain: WorldCupDomainModel = {
  matches: [],
  teams: {},
  predictions: {},
  markets: {},
  simulation: { probabilities: [] },
  calibration: {
    status: 'no_results',
    sampleSize: 0,
    minimumSampleSize: 30,
    brierScore: null,
    logLoss: null,
    accuracy: null,
    brierReference: 2 / 3,
    calibrationError: null,
    message: '暂无带真实比分的完赛样本，模型尚未经过结果回测。',
  },
  predictionAudit: {
    status: 'warning',
    checkedMatches: 0,
    passedMatches: 0,
    warningCount: 1,
    maxProbabilityDrift: 0,
    message: '暂无可自检的预测样本，需等待赛程进入 Domain Model。',
  },
  backtest: runWorldCupBacktest([]),
  backtestSamples: [],
  predictionReliability: {},
  sourceGate: {
    tier: 'local',
    label: 'Local seed gate',
    canUseForRealPrediction: false,
    requiresOfficialVerification: true,
    message: '本地 seed 只允许教育演示口径，不能进入真实赛事预测。',
  },
  matchDataQuality: {},
  source: 'local',
  lastUpdated: 0,
  errors: [],
};

describe('buildCombinedCalibrationPresentation', () => {
  it('builds notice and audit copy from the same combined calibration summary', () => {
    const historical = runHistoricalWorldCupBacktestFromCsv([
      'match_id,stage,source_tier,raw_confidence,home_win,draw,away_win,home_score,away_score',
      ...Array.from(
        { length: 30 },
        (_, index) => `provider-ready-${index},${index < 20 ? 'group' : 'final'},verified_provider,0.72,20,25,55,0,1`,
      ),
    ].join('\n'));

    const presentation = buildCombinedCalibrationPresentation(baseDomain, historical);

    expect(presentation.noticeLabel).toBe('合并校准可用 · 合并后样本 30');
    expect(presentation.noticeDetail).toContain('候选来源：官方 0 · 第三方 30');
    expect(presentation.noticeDetail).toContain('来源 readiness：官方候选 0/30 · 阶段 0/2；第三方候选 30/30 · 阶段 2/2（第三方不等同官方）');
    expect(presentation.noticeDetail).toContain('第三方候选充足，但不等同官方校准证据');
    expect(presentation.noticeDetail).not.toContain('。。');
    expect(presentation.auditLabel).toBe('导入可用 · 合并校准可用 · 合并后样本 30');
    expect(presentation.auditDetail).toBe('第三方候选充足，但不等同官方校准证据');
    expect(presentation.details).toEqual([
      ['导入结果', '导入接收 30 · 拒绝 0'],
      ['校准候选', '校准候选 30/30 · 阶段 2/2（当前 domain 0 · 历史导入 30）'],
      ['候选来源', '候选来源：官方 0 · 第三方 30'],
      ['来源 readiness', '来源 readiness：官方候选 0/30 · 阶段 0/2；第三方候选 30/30 · 阶段 2/2（第三方不等同官方）'],
      ['证据等级', '第三方候选充足，但不等同官方校准证据'],
      ['下一步', expect.stringContaining('补充官方')],
      ['来源保留', '官方 0 · 第三方 30 · 样例/本地 0；样例/本地排除 0'],
      ['重复处理', '合并拒绝重复 0'],
      ['边界说明', expect.stringContaining('第三方 provider 仍保留来源标签')],
    ]);
  });
});
