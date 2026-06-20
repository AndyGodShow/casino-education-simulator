import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MatchInsightPanel } from './MatchInsightPanel';
import { predictMatch } from '../../football/worldCup/logic/predictionEngine';
import type { WorldCupMatch, WorldCupTeam } from '../../football/worldCup/types';
import type {
  MatchDataQualityState,
  PredictionReliabilityState,
  WorldCupCalibrationState,
  WorldCupPredictionAuditState,
} from '../../football/worldCup/domain/WorldCupDomainModel';

const match: WorldCupMatch = {
  id: 'insight-test',
  competitionId: 'world-cup-2026',
  stage: 'group',
  group: 'A',
  homeTeamId: 'alpha',
  awayTeamId: 'beta',
  kickoff: '2026-06-18T18:00:00.000Z',
  venue: 'Sample venue',
  status: 'scheduled',
  source: 'local',
  lastUpdated: '2026-06-18T00:00:00.000Z',
};

const homeTeam: WorldCupTeam = {
  id: 'alpha',
  name: 'Alpha',
  shortName: 'ALP',
  countryCode: 'AL',
  group: 'A',
  rating: 84,
  attack: 83,
  defense: 82,
  form: 81,
};

const awayTeam: WorldCupTeam = {
  id: 'beta',
  name: 'Beta',
  shortName: 'BET',
  countryCode: 'BE',
  group: 'A',
  rating: 78,
  attack: 77,
  defense: 76,
  form: 78,
};

const calibration: WorldCupCalibrationState = {
  status: 'no_results',
  sampleSize: 0,
  minimumSampleSize: 30,
  brierScore: null,
  logLoss: null,
  accuracy: null,
  brierReference: 2 / 3,
  calibrationError: null,
  message: '暂无带真实比分的完赛样本，模型尚未经过结果回测。',
};

const predictionAudit: WorldCupPredictionAuditState = {
  status: 'passed',
  checkedMatches: 1,
  passedMatches: 1,
  warningCount: 0,
  maxProbabilityDrift: 0,
  message: '已自检 1 场预测：λ、比分分布、胜平负概率和顶层展示一致。',
};

const matchDataQuality: MatchDataQualityState = {
  matchId: match.id,
  source: 'local',
  tier: 'local',
  label: 'Local seed',
  lastUpdated: Date.parse(match.lastUpdated),
  staleness: 'stale',
  stalenessHours: 8,
  isOfficialFixture: false,
  isVerifiedProvider: false,
  hasVerifiedScore: false,
  canUseForRealPrediction: false,
  caveat: '本地 seed 仅用于教育演示，不应用作真实赛事预测。',
};

const predictionReliability: PredictionReliabilityState = {
  matchId: match.id,
  rawConfidence: 0.64,
  adjustedConfidence: 0.22,
  label: 'low',
  deductions: [
    {
      reason: 'local_source',
      amount: 0.35,
      message: '本地 seed 只能支撑教育演示，不能支撑真实预测自信。',
    },
    {
      reason: 'no_calibration_sample',
      amount: 0.12,
      message: '暂无真实比分样本，模型尚未经过结果回测。',
    },
  ],
  caveat: '当前结果只适合教育演示；数据源和输入覆盖率不足以支撑真实预测自信。',
};

describe('MatchInsightPanel', () => {
  const prediction = predictMatch(match, homeTeam, awayTeam);
  const teams = { [homeTeam.id]: homeTeam, [awayTeam.id]: awayTeam };

  it('renders a calibrated probability tendency before detailed analysis', () => {
    const html = renderToStaticMarkup(
      <MatchInsightPanel
        match={match}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        prediction={prediction}
        market={null}
        calibration={calibration}
        predictionAudit={predictionAudit}
        predictionReliability={predictionReliability}
        matchDataQuality={matchDataQuality}
        teams={teams}
      />
    );

    expect(html).toContain('概率倾向');
    expect(html).toContain('教育性模型估计');
    expect(html).toContain('Alpha 胜');
    expect(html).toContain('模型稳定度');
    expect(html).not.toContain('预测结论');
    expect(html).not.toContain('模型判断');
    expect(html.indexOf('概率倾向')).toBeLessThan(html.indexOf('概率概览'));
  });

  it('smoke renders all required section headings', () => {
    const html = renderToStaticMarkup(
      <MatchInsightPanel
        match={match}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        prediction={prediction}
        market={null}
        calibration={calibration}
        predictionAudit={predictionAudit}
        predictionReliability={predictionReliability}
        matchDataQuality={matchDataQuality}
        teams={teams}
      />
    );

    expect(html).toContain('概率概览');
    expect(html).toContain('证据边界');
    expect(html).toContain('可信度拆解');
    expect(html).toContain('模型为什么这样预测');
    expect(html).toContain('单场推导明细');
    expect(html).toContain('概率区间');
    expect(html).toContain('模拟结果摘要');
    expect(html).toContain('小组影响');
  });

  it('renders match header with team names', () => {
    const html = renderToStaticMarkup(
      <MatchInsightPanel
        match={match}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        prediction={prediction}
        market={null}
        calibration={calibration}
        predictionAudit={predictionAudit}
        predictionReliability={predictionReliability}
        matchDataQuality={matchDataQuality}
        teams={teams}
      />
    );
    expect(html).toContain('vs');
  });

  it('renders expected goals and win/draw/loss probabilities', () => {
    const html = renderToStaticMarkup(
      <MatchInsightPanel
        match={match}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        prediction={prediction}
        market={null}
        calibration={calibration}
        predictionAudit={predictionAudit}
        predictionReliability={predictionReliability}
        matchDataQuality={matchDataQuality}
        teams={teams}
      />
    );
    expect(html).toContain('预期进球');
    expect(html).toContain('平局');
    expect(html).toContain('胜');
  });

  it('renders ProbabilityBar components', () => {
    const html = renderToStaticMarkup(
      <MatchInsightPanel
        match={match}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        prediction={prediction}
        market={null}
        calibration={calibration}
        predictionAudit={predictionAudit}
        predictionReliability={predictionReliability}
        matchDataQuality={matchDataQuality}
        teams={teams}
      />
    );
    expect(html).toContain('模型');
    expect(html).toContain('市场参考');
    expect(html).toContain('融合概率');
  });

  it('shows the single-match derivation from lambdas to final probabilities', () => {
    const html = renderToStaticMarkup(
      <MatchInsightPanel
        match={match}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        prediction={prediction}
        market={null}
        calibration={calibration}
        predictionAudit={predictionAudit}
        predictionReliability={predictionReliability}
        matchDataQuality={matchDataQuality}
        teams={teams}
      />
    );

    expect(html).toContain('单场推导明细');
    expect(html).toContain('λ 输入');
    expect(html).toContain('比分分布 Top 5');
    expect(html).toContain('比分分布总和');
    expect(html).toContain('由比分分布汇总');
    expect(html).toContain('顶层展示概率');
    expect(html).toContain('概率一致性：已对齐');
    expect(html).toContain(prediction.decisionLayer.expectedGoals.home.toFixed(2));
    expect(html).toContain(prediction.decisionLayer.mostLikelyScore.home.toString());
    expect(html).toContain(prediction.decisionLayer.mostLikelyScore.away.toString());
  });

  it('surfaces prediction evidence boundaries for scheduled matches', () => {
    const html = renderToStaticMarkup(
      <MatchInsightPanel
        match={match}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        prediction={prediction}
        market={null}
        calibration={calibration}
        predictionAudit={predictionAudit}
        predictionReliability={predictionReliability}
        matchDataQuality={matchDataQuality}
        teams={teams}
      />
    );

    expect(html).toContain('证据边界');
    expect(html).toContain('链路自检');
    expect(html).toContain('已通过');
    expect(html).toContain('结果回测样本');
    expect(html).toContain('0/30');
    expect(html).toContain('数据口径');
    expect(html).toContain('Local seed');
    expect(html).toContain('自信折扣');
    expect(html).toContain('22%');
    expect(html).toContain('扣分 2 项');
    expect(html).toContain('当前结果只适合教育演示');
    expect(html).toContain('数据新鲜度：stale');
    expect(html).toContain('不等同于命中率证明');
  });

  it('renders only the final score for finished matches', () => {
    const html = renderToStaticMarkup(
      <MatchInsightPanel
        match={{ ...match, status: 'finished', homeScore: 3, awayScore: 2 }}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        prediction={prediction}
        market={null}
        calibration={calibration}
        predictionAudit={predictionAudit}
        predictionReliability={predictionReliability}
        matchDataQuality={matchDataQuality}
        teams={teams}
      />
    );

    expect(html).toContain('比分');
    expect(html).toContain('3 - 2');
    expect(html).not.toContain('概率概览');
    expect(html).not.toContain('可信度拆解');
    expect(html).not.toContain('证据边界');
    expect(html).not.toContain('模型为什么这样预测');
    expect(html).not.toContain('单场推导明细');
    expect(html).not.toContain('模拟结果摘要');
  });
});
