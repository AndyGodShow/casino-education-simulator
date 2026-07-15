import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PredictionPipelineAuditPanel } from './PredictionPipelineAuditPanel';
import type { MatchDataQualityState, WorldCupDomainModel } from '../domain/WorldCupDomainModel';
import type { MatchPrediction } from '../types';
import { runHistoricalWorldCupBacktestFromCsv, runWorldCupBacktest } from '../backtest';

const quality = (
  matchId: string,
  tier: MatchDataQualityState['tier'],
  overrides: Partial<MatchDataQualityState> = {},
): MatchDataQualityState => ({
  matchId,
  source: tier === 'official' ? 'official' : tier === 'verified_provider' ? 'api-football' : tier,
  tier,
  label: tier === 'official'
    ? 'Official fixture'
    : tier === 'verified_provider'
      ? 'Verified provider'
      : tier === 'sample'
        ? 'Sample fixtures'
        : 'Local seed',
  lastUpdated: Date.parse('2026-06-20T00:00:00.000Z'),
  staleness: 'fresh',
  stalenessHours: 0,
  isOfficialFixture: tier === 'official',
  isVerifiedProvider: tier === 'official' || tier === 'verified_provider',
  hasVerifiedScore: false,
  canUseForRealPrediction: tier === 'official',
  caveat: '测试数据质量说明',
  ...overrides,
});

const baseDomain: WorldCupDomainModel = {
  matches: [],
  teams: {},
  predictions: {},
  intelligence: {},
  actionGates: {},
  markets: {},
  simulation: { probabilities: [] },
  calibration: {
    status: 'insufficient_sample',
    sampleSize: 4,
    minimumSampleSize: 30,
    brierScore: 0.51,
    logLoss: 0.98,
    accuracy: 0.5,
    brierReference: 2 / 3,
    calibrationError: 0.08,
    message: '只有 4 场带真实比分的比赛，样本不足，不能证明模型准确。',
  },
  predictionAudit: {
    status: 'passed',
    checkedMatches: 48,
    passedMatches: 48,
    warningCount: 0,
    maxProbabilityDrift: 0,
    message: '已自检 48 场预测：λ、比分分布、胜平负概率和顶层展示一致。',
  },
  backtest: runWorldCupBacktest([]),
  backtestSamples: [],
  predictionReliability: {},
  sourceGate: {
    tier: 'verified_provider',
    label: 'Verified provider gate',
    canUseForRealPrediction: false,
    requiresOfficialVerification: true,
    message: '第三方 provider 数据可用于模型估计，但仍需官方赛程核验，不能标记为真实赛事预测。',
  },
  matchDataQuality: {
    official: quality('official', 'official'),
    provider: quality('provider', 'verified_provider', {
      staleness: 'stale',
      stalenessHours: 72,
      canUseForRealPrediction: false,
    }),
    sample: quality('sample', 'sample'),
  },
  source: 'api',
  lastUpdated: Date.parse('2026-06-20T00:00:00.000Z'),
  errors: [],
};

const prediction = (
  matchId: string,
  confidence: number,
  probabilities = { homeWin: 0.62, draw: 0.22, awayWin: 0.16 },
): MatchPrediction => ({
  matchId,
  probabilities,
  expectedGoals: { home: 1.5, away: 0.8 },
  scoreDistribution: [],
  mostLikelyScore: '1-0',
  confidence,
  explanation: { summary: '测试预测', factors: [] },
  modelVersion: 'v2',
  truth: {
    level: 'live',
    confidence: 0.86,
    description: '测试数据',
    sourceBreakdown: ['test'],
  },
  unifiedProbability: {
    matchId,
    model: {
      home: probabilities.homeWin,
      draw: probabilities.draw,
      away: probabilities.awayWin,
      source: 'model',
    },
    merged: {
      home: probabilities.homeWin,
      draw: probabilities.draw,
      away: probabilities.awayWin,
      source: 'ensemble',
    },
    truth: {
      level: 'live',
      confidence: 0.86,
      description: '测试数据',
      sourceBreakdown: ['test'],
    },
  },
  decisionLayer: {
    expectedGoals: { home: 1.5, away: 0.8 },
    scoreDistribution: [],
    oneX2: probabilities,
    mostLikelyScore: { home: 1, away: 0 },
    confidence,
  },
});

describe('PredictionPipelineAuditPanel', () => {
  it('summarizes why the current prediction pipeline remains educational', () => {
    const html = renderToStaticMarkup(<PredictionPipelineAuditPanel domain={baseDomain} />);

    expect(html).toContain('预测线路审计');
    expect(html).toContain('当前结论：教育模式，需官方核验');
    expect(html).toContain('第三方 provider 数据可用于模型估计');
    expect(html).toContain('推导自检：已通过');
    expect(html).toContain('自检 48/48');
    expect(html).toContain('本届赛前快照校准：样本不足');
    expect(html).toContain('样本 4/30');
    expect(html).toContain('数据质量分布');
    expect(html).toContain('官方 1');
    expect(html).toContain('第三方 1');
    expect(html).toContain('样例 1');
    expect(html).toContain('真实预测可用 1/3 场');
    expect(html).toContain('抓取过期/未知 1 场');
    expect(html).toContain('历史回测');
    expect(html).toContain('暂无已完赛预测样本');
    expect(html).toContain('等待真实比分进入 domain');
  });

  it('only marks the pipeline as real-prediction ready when the source gate allows it', () => {
    const html = renderToStaticMarkup(
      <PredictionPipelineAuditPanel
        domain={{
          ...baseDomain,
          sourceGate: {
            tier: 'official',
            label: 'Official fixture gate',
            canUseForRealPrediction: true,
            requiresOfficialVerification: false,
            message: '当前赛程通过官方口径门禁；预测仍需结果校准，不构成投注建议。',
          },
          matchDataQuality: {
            official: quality('official', 'official'),
            official2: quality('official2', 'official'),
          },
        }}
      />,
    );

    expect(html).toContain('当前结论：可进入真实预测口径');
    expect(html).toContain('官方 2');
    expect(html).toContain('真实预测可用 2/2 场');
    expect(html).toContain('抓取过期/未知 0 场');
  });

  it('shows current-domain backtest metrics when finished predictions are available', () => {
    const html = renderToStaticMarkup(
      <PredictionPipelineAuditPanel
        domain={{
          ...baseDomain,
          matches: [
            {
              id: 'finished-high-hit',
              competitionId: 'world-cup-2026',
              stage: 'group',
              group: 'A',
              homeTeamId: 'alpha',
              awayTeamId: 'beta',
              kickoff: '2026-06-18T18:00:00.000Z',
              status: 'finished',
              homeScore: 2,
              awayScore: 0,
              source: 'official',
              lastUpdated: '2026-06-18T22:00:00.000Z',
            },
            {
              id: 'scheduled-high',
              competitionId: 'world-cup-2026',
              stage: 'group',
              group: 'A',
              homeTeamId: 'gamma',
              awayTeamId: 'delta',
              kickoff: '2026-06-19T18:00:00.000Z',
              status: 'scheduled',
              source: 'official',
              lastUpdated: '2026-06-18T22:00:00.000Z',
            },
          ],
          predictions: {
            'scheduled-high': prediction('scheduled-high', 0.81),
          },
          backtest: runWorldCupBacktest([
            {
              matchId: 'finished-high-hit',
              stage: 'group',
              sourceTier: 'official',
              rawConfidence: 0.78,
              adjustedConfidence: 0.72,
              probabilities: {
                home: 0.62,
                draw: 0.22,
                away: 0.16,
              },
              outcome: 'home',
            },
          ]),
          backtestSamples: [
            {
              matchId: 'finished-high-hit',
              stage: 'group',
              sourceTier: 'official',
              rawConfidence: 0.78,
              adjustedConfidence: 0.72,
              probabilities: {
                home: 0.62,
                draw: 0.22,
                away: 0.16,
              },
              outcome: 'home',
            },
          ],
          matchDataQuality: {
            ...baseDomain.matchDataQuality,
            'finished-high-hit': quality('finished-high-hit', 'official', {
              hasVerifiedScore: true,
            }),
            'scheduled-high': quality('scheduled-high', 'official'),
          },
        }}
      />,
    );

    expect(html).toContain('历史回测');
    expect(html).toContain('回测样本 1');
    expect(html).toContain('Accuracy 100.0%');
    expect(html).toContain('降权后高自信 1 场');
    expect(html).toContain('官方 1');
    expect(html).toContain('第三方 0');
    expect(html).toContain('样例/本地 0');
    expect(html).toContain('校准证据不足');
    expect(html).toContain('继续补充非样例完赛样本');
  });

  it('shows optional historical import audit without upgrading imported samples to official', () => {
    const historical = runHistoricalWorldCupBacktestFromCsv([
      'match_id,stage,source_tier,raw_confidence,home_win,draw,away_win,home_score,away_score',
      'finished-high-hit,group,verified_provider,0.72,55,25,20,2,1',
      'historical-sample,group,sample,0.58,20,25,55,0,1',
    ].join('\n'));
    const html = renderToStaticMarkup(
      <PredictionPipelineAuditPanel
        domain={{
          ...baseDomain,
          matches: [
            {
              id: 'finished-high-hit',
              competitionId: 'world-cup-2026',
              stage: 'group',
              group: 'A',
              homeTeamId: 'alpha',
              awayTeamId: 'beta',
              kickoff: '2026-06-18T18:00:00.000Z',
              status: 'finished',
              homeScore: 2,
              awayScore: 0,
              source: 'official',
              lastUpdated: '2026-06-18T22:00:00.000Z',
            },
          ],
          predictions: {},
          backtest: runWorldCupBacktest([
            {
              matchId: 'finished-high-hit',
              stage: 'group',
              sourceTier: 'official',
              rawConfidence: 0.78,
              adjustedConfidence: 0.72,
              probabilities: {
                home: 0.62,
                draw: 0.22,
                away: 0.16,
              },
              outcome: 'home',
            },
          ]),
          backtestSamples: [
            {
              matchId: 'finished-high-hit',
              stage: 'group',
              sourceTier: 'official',
              rawConfidence: 0.78,
              adjustedConfidence: 0.72,
              probabilities: {
                home: 0.62,
                draw: 0.22,
                away: 0.16,
              },
              outcome: 'home',
            },
          ],
          matchDataQuality: {
            ...baseDomain.matchDataQuality,
            'finished-high-hit': quality('finished-high-hit', 'official', {
              hasVerifiedScore: true,
            }),
          },
        }}
        historicalBacktestRun={historical}
      />,
    );

    expect(html).toContain('历史导入审计');
    expect(html).toContain('导入可用');
    expect(html).toContain('合并后样本 2');
    expect(html).toContain('导入结果');
    expect(html).toContain('导入接收 2');
    expect(html).toContain('重复处理');
    expect(html).toContain('合并拒绝重复 1');
    expect(html).toContain('校准候选');
    expect(html).toContain('校准候选 1/30');
    expect(html).toContain('候选来源');
    expect(html).toContain('候选来源：官方 1 · 第三方 0');
    expect(html).toContain('来源 readiness');
    expect(html).toContain('来源 readiness：官方候选 1/30 · 阶段 1/2；第三方候选 0/30 · 阶段 0/2');
    expect(html).toContain('证据等级');
    expect(html).toContain('校准证据不足');
    expect(html).toContain('下一步');
    expect(html).toContain('继续导入官方或已核验 provider 完赛样本');
    expect(html).toContain('来源保留');
    expect(html).toContain('样例/本地数据保留来源标签');
    expect(html).toContain('边界说明');
    expect(html).toContain('当前 domain 样本优先');
  });
});
