import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DataSourceNotice } from './DataSourceNotice';
import type { WorldCupDomainModel } from '../domain/WorldCupDomainModel';
import { runHistoricalWorldCupBacktestFromCsv, runWorldCupBacktest } from '../backtest';

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

describe('DataSourceNotice', () => {
  it('surfaces calibration readiness when no backtest sample exists', () => {
    const html = renderToStaticMarkup(<DataSourceNotice domain={baseDomain} />);

    expect(html).toContain('本届赛前快照校准');
    expect(html).toContain('未回测');
    expect(html).toContain('暂无带真实比分的完赛样本');
    expect(html).toContain('链路自检');
    expect(html).toContain('有警告');
    expect(html).toContain('暂无可自检的预测样本');
    expect(html).toContain('数据门禁');
    expect(html).toContain('Local seed gate');
    expect(html).toContain('教育演示口径');
    expect(html).toContain('自信校正');
    expect(html).toContain('暂无可靠性样本');
    expect(html).toContain('高级指标来源');
    expect(html).toContain('暂无来源样本');
    expect(html).toContain('历史回测');
    expect(html).toContain('暂无回测样本');
    expect(html).toContain('等待真实比分进入 domain');
    expect(html).toContain('球队动态输入');
    expect(html).toContain('暂无赛果派生');
    expect(html).toContain('真实 xG 与伤停：未接入');
    expect(html).toContain('市场覆盖');
    expect(html).toContain('真实市场 0 场');
    expect(html).toContain('数据抓取新鲜度');
    expect(html).toContain('暂无赛程');
  });

  it('shows chronological holdout evidence without claiming profit', () => {
    const html = renderToStaticMarkup(
      <DataSourceNotice
        domain={{
          ...baseDomain,
          strategyResearch: {
            status: 'applied',
            generatedAt: '2026-07-02T12:00:00.000Z',
            acceptedRows: 49_000,
            candidateId: 'assertive-320',
            validationSampleSize: 60,
            holdoutSampleSize: 60,
            holdoutContexts: 2,
            brierImprovement: 0.023,
            message: '候选参数通过独立留出集门禁，作为已验证研究基准；不会静默覆盖当前 Prediction V2。',
          },
        }}
      />,
    );

    expect(html).toContain('历史策略时间滚动验证');
    expect(html).toContain('留出集通过');
    expect(html).toContain('49,000 条历史赛果');
    expect(html).toContain('留出 60 场');
    expect(html).toContain('Brier 改进 0.023');
    expect(html).toContain('不等于盈利证明');
    expect(html).not.toContain('保证盈利');
  });

  it('reports fixture freshness separately from advanced metric freshness', () => {
    const html = renderToStaticMarkup(
      <DataSourceNotice
        domain={{
          ...baseDomain,
          matchDataQuality: {
            fresh: {
              matchId: 'fresh',
              source: 'openfootball',
              tier: 'verified_provider',
              label: 'Verified provider',
              lastUpdated: Date.parse('2026-07-02T10:00:00.000Z'),
              staleness: 'fresh',
              stalenessHours: 2,
              isOfficialFixture: false,
              isVerifiedProvider: true,
              hasVerifiedScore: false,
              canUseForRealPrediction: false,
              caveat: 'third party',
            },
            stale: {
              matchId: 'stale',
              source: 'openfootball',
              tier: 'verified_provider',
              label: 'Verified provider',
              lastUpdated: Date.parse('2026-06-29T10:00:00.000Z'),
              staleness: 'stale',
              stalenessHours: 74,
              isOfficialFixture: false,
              isVerifiedProvider: true,
              hasVerifiedScore: false,
              canUseForRealPrediction: false,
              caveat: 'third party',
            },
          },
        }}
      />,
    );

    expect(html).toContain('数据抓取新鲜度');
    expect(html).toContain('新鲜 1/2 场');
    expect(html).toContain('过期 1 · 时间未知 0');
    expect(html).toContain('相对当前评估时间');
    expect(html).toContain('不代表上游内容已更新或经过官方核验');
  });

  it('separates result-derived team inputs from real market coverage', () => {
    const html = renderToStaticMarkup(
      <DataSourceNotice
        domain={{
          ...baseDomain,
          teams: {
            france: {
              id: 'france',
              name: 'France',
              shortName: 'FRA',
              countryCode: 'FR',
              group: 'A',
              rating: 90,
              attack: 88,
              defense: 87,
              form: 86,
              coreMetricSources: {
                rating: { source: 'seed', trustLevel: 'low' },
                attack: { source: 'provider', providerName: 'OpenFootball', trustLevel: 'medium' },
                defense: { source: 'provider', providerName: 'OpenFootball', trustLevel: 'medium' },
                form: { source: 'provider', providerName: 'OpenFootball', trustLevel: 'medium' },
              },
            },
          },
          markets: {
            'match-1': {
              kind: 'real',
              source: 'polymarket',
              probabilities: { home: 0.5, draw: 0.25, away: 0.25 },
              status: 'available',
              confidence: 0.7,
              quality: 'high',
              auditable: true,
              message: 'market',
            },
          },
        }}
      />,
    );

    expect(html).toContain('球队动态输入');
    expect(html).toContain('赛果派生 1/1 队');
    expect(html).toContain('rating 仍是静态先验');
    expect(html).toContain('市场覆盖');
    expect(html).toContain('真实市场 1 场');
  });

  it('shows calibration metrics when finished-result samples exist', () => {
    const html = renderToStaticMarkup(
      <DataSourceNotice
        domain={{
          ...baseDomain,
          calibration: {
            ...baseDomain.calibration,
            status: 'insufficient_sample',
            sampleSize: 4,
            brierScore: 0.51,
            logLoss: 0.98,
            accuracy: 0.5,
            calibrationError: 0.08,
            message: '只有 4 场带真实比分的比赛，样本不足，不能证明模型准确。',
          },
        }}
      />,
    );

    expect(html).toContain('样本不足');
    expect(html).toContain('样本 4/30');
    expect(html).toContain('Brier 0.510');
    expect(html).toContain('Accuracy 50.0%');
  });

  it('shows prediction audit metrics separately from calibration', () => {
    const html = renderToStaticMarkup(
      <DataSourceNotice
        domain={{
          ...baseDomain,
          predictionAudit: {
            status: 'passed',
            checkedMatches: 48,
            passedMatches: 48,
            warningCount: 0,
            maxProbabilityDrift: 0,
            message: '已自检 48 场预测：λ、比分分布、胜平负概率和顶层展示一致。',
          },
        }}
      />,
    );

    expect(html).toContain('链路自检');
    expect(html).toContain('已通过');
    expect(html).toContain('自检 48/48');
    expect(html).toContain('最大漂移 0.00000pp');
  });

  it('summarizes adjusted confidence across match reliability states', () => {
    const html = renderToStaticMarkup(
      <DataSourceNotice
        domain={{
          ...baseDomain,
          predictionReliability: {
            'match-1': {
              matchId: 'match-1',
              rawConfidence: 0.72,
              adjustedConfidence: 0.24,
              label: 'low',
              deductions: [
                {
                  reason: 'local_source',
                  amount: 0.35,
                  message: 'local',
                },
              ],
              caveat: 'low',
            },
            'match-2': {
              matchId: 'match-2',
              rawConfidence: 0.78,
              adjustedConfidence: 0.58,
              label: 'medium',
              deductions: [
                {
                  reason: 'insufficient_calibration_sample',
                  amount: 0.08,
                  message: 'sample',
                },
              ],
              caveat: 'medium',
            },
          },
        }}
      />,
    );

    expect(html).toContain('自信校正');
    expect(html).toContain('平均 41.0%');
    expect(html).toContain('低自信 1/2 场');
    expect(html).toContain('扣分项 2 条');
  });

  it('summarizes advanced metric provenance coverage across reliability states', () => {
    const html = renderToStaticMarkup(
      <DataSourceNotice
        domain={{
          ...baseDomain,
          predictionReliability: {
            'match-1': {
              matchId: 'match-1',
              rawConfidence: 0.72,
              adjustedConfidence: 0.52,
              label: 'medium',
              advancedMetricTrust: {
                availableFields: 12,
                sourcedFields: 10,
                highTrustFields: 4,
                mediumTrustFields: 3,
                lowTrustFields: 3,
                missingSourceFields: ['home.advancedMetricSources.travelFatigue'],
                staleFields: ['away.advancedMetricSources.elo'],
                unknownFreshnessFields: [],
                averageTrustScore: 0.69,
                sourceCoverageRatio: 0.83,
              },
              deductions: [
                {
                  reason: 'partial_trust_advanced_metrics',
                  amount: 0.06,
                  message: 'partial',
                },
              ],
              caveat: 'medium',
            },
            'match-2': {
              matchId: 'match-2',
              rawConfidence: 0.68,
              adjustedConfidence: 0.41,
              label: 'low',
              advancedMetricTrust: {
                availableFields: 6,
                sourcedFields: 3,
                highTrustFields: 1,
                mediumTrustFields: 1,
                lowTrustFields: 1,
                missingSourceFields: ['away.advancedMetricSources.restDays'],
                staleFields: [],
                unknownFreshnessFields: ['home.advancedMetricSources.recentXgFor'],
                averageTrustScore: 0.35,
                sourceCoverageRatio: 0.5,
              },
              deductions: [
                {
                  reason: 'missing_advanced_metric_sources',
                  amount: 0.08,
                  message: 'missing',
                },
              ],
              caveat: 'low',
            },
          },
        }}
      />,
    );

    expect(html).toContain('高级指标来源');
    expect(html).toContain('来源覆盖 72.2%');
    expect(html).toContain('平均信任 57.7%');
    expect(html).toContain('低信任字段 4');
    expect(html).toContain('过期/未知更新时间 2');
  });

  it('shows verified-provider gate without upgrading it to official prediction mode', () => {
    const html = renderToStaticMarkup(
      <DataSourceNotice
        domain={{
          ...baseDomain,
          source: 'api',
          sourceGate: {
            tier: 'verified_provider',
            label: 'Verified provider gate',
            canUseForRealPrediction: false,
            requiresOfficialVerification: true,
            message: '第三方 provider 数据可用于模型估计，但仍需官方赛程核验，不能标记为真实赛事预测。',
          },
        }}
      />,
    );

    expect(html).toContain('数据门禁');
    expect(html).toContain('需官方核验');
    expect(html).toContain('不能标记为真实赛事预测');
  });

  it('summarizes current-domain backtest when finished samples exist', () => {
    const html = renderToStaticMarkup(
      <DataSourceNotice
        domain={{
          ...baseDomain,
          backtest: runWorldCupBacktest([
            {
              matchId: 'official-hit',
              stage: 'group',
              sourceTier: 'official',
              rawConfidence: 0.74,
              adjustedConfidence: 0.72,
              probabilities: {
                home: 0.6,
                draw: 0.25,
                away: 0.15,
              },
              outcome: 'home',
            },
            {
              matchId: 'provider-hit',
              stage: 'final',
              sourceTier: 'verified_provider',
              rawConfidence: 0.62,
              adjustedConfidence: 0.56,
              probabilities: {
                home: 0.2,
                draw: 0.25,
                away: 0.55,
              },
              outcome: 'away',
            },
            {
              matchId: 'local-miss',
              stage: 'semi',
              sourceTier: 'local',
              rawConfidence: 0.5,
              adjustedConfidence: 0.38,
              probabilities: {
                home: 0.5,
                draw: 0.3,
                away: 0.2,
              },
              outcome: 'away',
            },
          ]),
        }}
      />,
    );

    expect(html).toContain('历史回测');
    expect(html).toContain('样本 3');
    expect(html).toContain('Accuracy 66.7%');
    expect(html).toContain('Brier 0.510');
    expect(html).toContain('降权后高自信 1 场');
    expect(html).toContain('官方 1');
    expect(html).toContain('第三方 1');
    expect(html).toContain('样例/本地 1');
    expect(html).toContain('校准证据不足');
    expect(html).toContain('继续补充非样例完赛样本');
  });

  it('summarizes optional combined historical calibration without upgrading providers to official evidence', () => {
    const historical = runHistoricalWorldCupBacktestFromCsv([
      'match_id,stage,source_tier,raw_confidence,home_win,draw,away_win,home_score,away_score',
      ...Array.from(
        { length: 30 },
        (_, index) => `provider-ready-${index},${index < 20 ? 'group' : 'final'},verified_provider,0.72,20,25,55,0,1`,
      ),
    ].join('\n'));
    const html = renderToStaticMarkup(
      <DataSourceNotice
        domain={baseDomain}
        historicalBacktestRun={historical}
      />,
    );

    expect(html).toContain('合并校准证据');
    expect(html).toContain('合并校准可用');
    expect(html).toContain('合并后样本 30');
    expect(html).toContain('候选来源：官方 0 · 第三方 30');
    expect(html).toContain('来源 readiness：官方候选 0/30 · 阶段 0/2；第三方候选 30/30 · 阶段 2/2（第三方不等同官方）');
    expect(html).toContain('第三方候选充足，但不等同官方校准证据');
    expect(html).toContain('下一步：第三方候选已达阈值');
    expect(html).not.toContain('官方校准候选充足');
  });
});
