import type { BetSelection, WorldCupMatch, WorldCupTeam, MatchPrediction, PredictionActionGate } from '../../football/worldCup/types';
import { createDataTrustInfo, type DataTrustInfo } from '../../../core/trustLayer/dataTruth';
import { ExpandablePanel } from '../../../../components/ui/ExpandablePanel';
import { ProbabilityBar } from '../../../../components/ui/ProbabilityBar';
import { TrustBadge } from '../../../../components/ui/TrustBadge';
import { getCountryDisplayName } from '../../../../utils/countryNameMap';
import { GroupSimulator } from '../../football/worldCup/components/GroupSimulator';
import { worldCupStageLabels } from '../../football/worldCup/stageLabels';
import type {
  GroupSimulationState,
  MatchDataQualityState,
  MarketData,
  PredictionReliabilityState,
  WorldCupCalibrationState,
  WorldCupPredictionAuditState,
} from '../../football/worldCup/domain/WorldCupDomainModel';
import { ProbabilityExplanationPanel } from './ProbabilityExplanationPanel';
import { TrustBreakdownPanel } from './TrustBreakdownPanel';
import { ProbabilityRangeDisplay } from './ProbabilityRangeDisplay';
import styles from './MatchInsightPanel.module.css';

type MatchInsightPanelProps = {
  match: WorldCupMatch;
  homeTeam: WorldCupTeam;
  awayTeam: WorldCupTeam;
  prediction: MatchPrediction;
  market: MarketData | null;
  calibration: WorldCupCalibrationState;
  predictionAudit: WorldCupPredictionAuditState;
  predictionReliability: PredictionReliabilityState;
  matchDataQuality: MatchDataQualityState;
  actionGate?: PredictionActionGate;
  simulation?: GroupSimulationState;
  teams: Record<string, WorldCupTeam>;
};

const confidenceBand = (confidence: number): 'low' | 'medium' | 'high' => {
  if (confidence >= 0.72) return 'high';
  if (confidence >= 0.52) return 'medium';
  return 'low';
};

type VerdictOutcome = {
  key: 'home' | 'draw' | 'away';
  label: string;
  probability: number;
};

const getPredictionVerdict = (
  prediction: MatchPrediction,
  homeName: string,
  awayName: string,
): VerdictOutcome => {
  const outcomes: VerdictOutcome[] = [
    { key: 'home', label: `${homeName} 胜`, probability: prediction.probabilities.homeWin },
    { key: 'draw', label: '平局', probability: prediction.probabilities.draw },
    { key: 'away', label: `${awayName} 胜`, probability: prediction.probabilities.awayWin },
  ];

  return outcomes.reduce((best, outcome) => (outcome.probability > best.probability ? outcome : best));
};

function formatFinalScore(match: WorldCupMatch) {
  if (typeof match.homeScore === 'number' && typeof match.awayScore === 'number') {
    return `${match.homeScore} - ${match.awayScore}`;
  }

  return '- - -';
}

function formatAuditLabel(audit: WorldCupPredictionAuditState) {
  if (audit.status === 'passed') return '已通过';
  if (audit.status === 'warning') return '有警告';
  return '未通过';
}

function formatCalibrationLabel(calibration: WorldCupCalibrationState) {
  if (calibration.status === 'ready') return '可初步校准';
  if (calibration.status === 'insufficient_sample') return '样本不足';
  return '未回测';
}

function formatReliabilityLabel(reliability: PredictionReliabilityState) {
  if (reliability.label === 'high') return '高';
  if (reliability.label === 'medium') return '中';
  return '低';
}

function formatActionLabel(action: PredictionActionGate['action']) {
  if (action === 'skip_due_to_low_confidence') return '跳过';
  if (action === 'observe_only') return '仅观察';
  return '教育模拟';
}

function formatActionDetail(actionGate: PredictionActionGate) {
  const firstReason = actionGate.reasons[0] ?? '当前策略动作来自数据质量、校准、情报和市场参考门禁。';
  const factorCount = actionGate.blockingFactors.length;
  return factorCount > 0 ? `${firstReason} 触发 ${factorCount} 项门禁。` : firstReason;
}

function formatRiskPolicy(actionGate: PredictionActionGate) {
  const cap = formatPercent(actionGate.riskPolicy.maxSimulatedStakeFraction, 1);
  return `模拟仓位上限 ${cap}。${actionGate.riskPolicy.note}`;
}

function formatSelection(selection: BetSelection) {
  if (selection === 'home') return '主胜';
  if (selection === 'away') return '客胜';
  return '平局';
}

function formatSimulationCandidate(actionGate: PredictionActionGate) {
  const candidate = actionGate.simulationCandidate;
  if (!candidate) return '';
  return `模拟方向 ${formatSelection(candidate.selection)}，调整后 EV ${(candidate.adjustedExpectedValue * 100).toFixed(1)}%，建议模拟仓位 ${formatPercent(candidate.recommendedSimulatedStakeFraction, 2)}。`;
}

function isProviderFixture(source: WorldCupMatch['source']) {
  return source === 'real'
    || source === 'openfootball'
    || source === 'api-football'
    || source === 'sportmonks';
}

function formatDataScope(match: WorldCupMatch) {
  if (match.source === 'official') return '官方赛程 + 本地模型';
  if (isProviderFixture(match.source)) return '第三方赛程 + 本地模型';
  if (match.source === 'local') return '本地 seed + 本地模型';
  if (match.source === 'manual') return '手工赛程 + 本地模型';
  return '样例赛程 + 本地模型';
}

function formatEstimateLabel(match: WorldCupMatch) {
  if (match.source === 'official') return '官方赛程 + 本地模型估计';
  if (isProviderFixture(match.source)) return '第三方赛程 + 本地模型估计';
  return '教育性模型估计';
}

function formatPercent(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function maxProbabilityDrift(prediction: MatchPrediction) {
  const oneX2 = prediction.decisionLayer.oneX2;
  return Math.max(
    Math.abs(prediction.probabilities.homeWin - oneX2.homeWin),
    Math.abs(prediction.probabilities.draw - oneX2.draw),
    Math.abs(prediction.probabilities.awayWin - oneX2.awayWin),
  );
}

export function MatchInsightPanel({
  match,
  homeTeam,
  awayTeam,
  prediction,
  market,
  calibration,
  predictionAudit,
  predictionReliability,
  matchDataQuality,
  actionGate,
  simulation,
  teams,
}: MatchInsightPanelProps) {
  const homeName = getCountryDisplayName(homeTeam.name);
  const awayName = getCountryDisplayName(awayTeam.name);
  const isFinished = match.status === 'finished';
  const stageLabel = match.stage === 'group'
    ? `小组 ${match.group ?? '-'}`
    : worldCupStageLabels[match.stage];

  if (isFinished) {
    return (
      <div className={styles.insightShell}>
        <section className={styles.matchHeader}>
          <div>
            <span className={styles.sectionKicker}>比赛详情</span>
            <h2 className={styles.matchTeams}>{homeName} vs {awayName}</h2>
            <p className={styles.matchMeta}>{stageLabel}</p>
          </div>
        </section>

        <section className={styles.finalScorePanel} aria-label="最终比分">
          <span>比分</span>
          <strong>{formatFinalScore(match)}</strong>
        </section>
      </div>
    );
  }

  const merged = prediction.unifiedProbability.merged;
  const marketProbability = market?.probabilities ?? prediction.unifiedProbability.market;
  const hasMarketData = marketProbability != null;
  const stabilityBand = confidenceBand(prediction.confidence);
  const verdict = getPredictionVerdict(prediction, homeName, awayName);
  const estimateLabel = formatEstimateLabel(match);
  const auditLabel = formatAuditLabel(predictionAudit);
  const calibrationLabel = formatCalibrationLabel(calibration);
  const reliabilityLabel = formatReliabilityLabel(predictionReliability);
  const calibrationSample = `${calibration.sampleSize}/${calibration.minimumSampleSize}`;
  const dataScope = formatDataScope(match);
  const decisionLayer = prediction.decisionLayer;
  const topScoreDistribution = [...decisionLayer.scoreDistribution]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5);
  const scoreDistributionSum = decisionLayer.scoreDistribution
    .reduce((sum, score) => sum + score.probability, 0);
  const probabilityDrift = maxProbabilityDrift(prediction);
  const probabilityAlignment = probabilityDrift <= 1e-6 ? '已对齐' : '需复核';

  const deviation = market?.deviation ?? null;

  const marketTruth: DataTrustInfo | null = marketProbability
    ? createDataTrustInfo(
      market?.status === 'stale' ? 'stale' : 'live',
      market?.message ?? 'Market probability reference.',
      [market?.source ?? 'polymarket'],
      market?.confidence,
    )
    : null;

  return (
    <div className={styles.insightShell}>
      {/* ── Match Header ── */}
      <section className={styles.matchHeader}>
        <div>
          <span className={styles.sectionKicker}>比赛详情</span>
          <h2 className={styles.matchTeams}>{homeName} vs {awayName}</h2>
          <p className={styles.matchMeta}>
            {stageLabel}
            {' · '}
            {new Date(match.kickoff).toLocaleString('zh-CN')}
            {' · '}
            {match.venue && match.venue !== 'Sample venue' ? match.venue : '样例场馆'}
          </p>
        </div>
        <TrustBadge truth={prediction.truth} />
      </section>

      <section className={`${styles.verdictPanel} ${styles[`verdict-${verdict.key}`]}`} aria-label="概率倾向">
        <div className={styles.verdictCopy}>
          <span className={styles.sectionKicker}>概率倾向</span>
          <p>{estimateLabel}</p>
          <strong>{verdict.label}</strong>
        </div>
        <div className={styles.verdictStats}>
          <div>
            <span>最高项概率</span>
            <strong>{(verdict.probability * 100).toFixed(1)}%</strong>
          </div>
          <div>
            <span>最可能比分</span>
            <strong>{prediction.mostLikelyScore}</strong>
          </div>
          <div>
            <span>模型稳定度</span>
            <strong>{(prediction.confidence * 100).toFixed(0)}%</strong>
          </div>
          <div>
            <span>可信自信</span>
            <strong>{formatPercent(predictionReliability.adjustedConfidence, 0)}</strong>
          </div>
        </div>
      </section>

      {/* ── Probability Overview ── */}
      <section className={styles.overviewSection}>
        <span className={styles.sectionKicker}>概率概览</span>
        <ProbabilityBar label={`模型 · ${homeName}`} value={prediction.probabilities.homeWin} variant="model" />
        <ProbabilityBar label="市场参考" value={marketProbability?.home ?? null} variant="market" />
        <ProbabilityBar
          label={`融合概率（未启用则等于模型） · ${homeName}`}
          value={merged?.home ?? prediction.probabilities.homeWin}
          variant="merged"
        />
      </section>

      {/* ── Core Stats ── */}
      <section className={styles.insightSection}>
        <div className={styles.sectionHeader}>
          <h3>预期进球与胜平负概率</h3>
          <TrustBadge truth={prediction.truth} />
        </div>
        <div className={styles.coreGrid}>
          <div className={styles.coreCell}>
            <span>预期进球</span>
            <strong>{prediction.expectedGoals.home.toFixed(2)} - {prediction.expectedGoals.away.toFixed(2)}</strong>
          </div>
          <div className={styles.coreCell}>
            <span>{homeName} 胜</span>
            <strong>{(prediction.probabilities.homeWin * 100).toFixed(1)}%</strong>
          </div>
          <div className={styles.coreCell}>
            <span>平局</span>
            <strong>{(prediction.probabilities.draw * 100).toFixed(1)}%</strong>
          </div>
          <div className={styles.coreCell}>
            <span>{awayName} 胜</span>
            <strong>{(prediction.probabilities.awayWin * 100).toFixed(1)}%</strong>
          </div>
        </div>
      </section>

      <div className={styles.collapsibleSection}>
        <ExpandablePanel title="数据可信度与证据边界" summary={`${reliabilityLabel} · ${formatPercent(predictionReliability.adjustedConfidence, 0)}`}>
          <div className={styles.evidenceGrid} aria-label="预测证据边界">
            <div className={styles.evidenceCell}>
              <span>链路自检</span>
              <strong>{auditLabel}</strong>
              <p>
                自检 {predictionAudit.passedMatches}/{predictionAudit.checkedMatches} 场；
                最大概率漂移 {(predictionAudit.maxProbabilityDrift * 100).toFixed(5)}pp。
              </p>
            </div>
            <div className={styles.evidenceCell}>
              <span>结果回测样本</span>
              <strong>{calibrationLabel} · {calibrationSample}</strong>
              <p>{calibration.message} 这不等同于命中率证明。</p>
            </div>
            <div className={styles.evidenceCell}>
              <span>数据口径</span>
              <strong>{matchDataQuality.label} · {dataScope}</strong>
              <p>
                数据新鲜度：{matchDataQuality.staleness}。
                {matchDataQuality.caveat}
              </p>
            </div>
            <div className={styles.evidenceCell}>
              <span>自信折扣</span>
              <strong>
                {reliabilityLabel} · {formatPercent(predictionReliability.adjustedConfidence, 0)}
                {' '}
                <small>原始 {formatPercent(predictionReliability.rawConfidence, 0)}</small>
              </strong>
              <p>
                扣分 {predictionReliability.deductions.length} 项。
                {predictionReliability.caveat}
              </p>
            </div>
            {actionGate && (
              <div className={styles.evidenceCell}>
                <span>策略动作</span>
                <strong>{formatActionLabel(actionGate.action)}</strong>
                <p>
                  {formatActionDetail(actionGate)}
                  {' '}
                  {formatRiskPolicy(actionGate)}
                  {' '}
                  {formatSimulationCandidate(actionGate)}
                </p>
              </div>
            )}
          </div>
        </ExpandablePanel>
      </div>

      {/* ── Trust Breakdown ── */}
      <div className={styles.collapsibleSection}>
        <ExpandablePanel title="可信度拆解" summary="数据源、稳定性、市场与校准">
          <TrustBreakdownPanel
            truth={prediction.truth}
            confidence={stabilityBand}
            match={match}
            marketTruth={marketTruth}
          />
        </ExpandablePanel>
      </div>

      {/* ── Explanation Layer (collapsed by default) ── */}
      <div className={styles.collapsibleSection}>
        <ExpandablePanel title="模型为什么这样预测" summary="评分、状态、进攻和防守因素">
          {!hasMarketData && <p>No market data available / 暂无市场数据</p>}
          <ProbabilityExplanationPanel
            factors={prediction.explanation.factors}
            deviation={deviation}
            hasMarketData={hasMarketData}
            homeTeamName={homeName}
            awayTeamName={awayName}
          />
        </ExpandablePanel>
      </div>

      <div className={styles.collapsibleSection}>
        <ExpandablePanel title="单场推导明细" summary="λ → 比分分布 → 1X2 → 顶层概率">
          <div className={styles.derivationPanel}>
            <div className={styles.derivationGrid}>
              <div className={styles.derivationCell}>
                <span>λ 输入</span>
                <strong>{homeName} {decisionLayer.expectedGoals.home.toFixed(2)}</strong>
                <strong>{awayName} {decisionLayer.expectedGoals.away.toFixed(2)}</strong>
                <p>由球队评分、攻防拆分、状态和比赛上下文生成，不从最终比分反推。</p>
              </div>
              <div className={styles.derivationCell}>
                <span>比分分布总和</span>
                <strong>{formatPercent(scoreDistributionSum, 3)}</strong>
                <p>
                  最可能比分：
                  {decisionLayer.mostLikelyScore.home}-{decisionLayer.mostLikelyScore.away}
                  。
                </p>
              </div>
              <div className={styles.derivationCell}>
                <span>概率一致性：{probabilityAlignment}</span>
                <strong>最大漂移 {(probabilityDrift * 100).toFixed(5)}pp</strong>
                <p>顶层展示概率必须与比分分布汇总后的 1X2 保持一致。</p>
              </div>
            </div>

            <div className={styles.derivationColumns}>
              <div>
                <h4>比分分布 Top 5</h4>
                <ol className={styles.scoreList} role="list">
                  {topScoreDistribution.map((score) => (
                    <li key={`${score.home}-${score.away}`} className={styles.scoreItem}>
                      <span>{score.home}-{score.away}</span>
                      <strong>{formatPercent(score.probability, 2)}</strong>
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <h4>由比分分布汇总</h4>
                <div className={styles.probabilityCompare}>
                  <span>{homeName} 胜</span>
                  <strong>{formatPercent(decisionLayer.oneX2.homeWin)}</strong>
                  <span>平局</span>
                  <strong>{formatPercent(decisionLayer.oneX2.draw)}</strong>
                  <span>{awayName} 胜</span>
                  <strong>{formatPercent(decisionLayer.oneX2.awayWin)}</strong>
                </div>
              </div>

              <div>
                <h4>顶层展示概率</h4>
                <div className={styles.probabilityCompare}>
                  <span>{homeName} 胜</span>
                  <strong>{formatPercent(prediction.probabilities.homeWin)}</strong>
                  <span>平局</span>
                  <strong>{formatPercent(prediction.probabilities.draw)}</strong>
                  <span>{awayName} 胜</span>
                  <strong>{formatPercent(prediction.probabilities.awayWin)}</strong>
                </div>
              </div>
            </div>
          </div>
        </ExpandablePanel>
      </div>

      {/* ── Probability Range ── */}
      <div className={styles.collapsibleSection}>
        <ExpandablePanel title="概率区间" summary="单点概率的置信范围">
          <ProbabilityRangeDisplay
            unifiedProbability={prediction.unifiedProbability}
            confidence={stabilityBand}
            uncertaintyAdjustment={deviation?.uncertaintyAdjustment ?? null}
            homeTeamName={homeName}
            awayTeamName={awayName}
          />
        </ExpandablePanel>
      </div>

      {/* ── Simulation Summary ── */}
      <div className={styles.collapsibleSection}>
        <ExpandablePanel title="模拟结果摘要" summary="基于当前赛程的本地小组模拟">
          <p style={{ fontSize: '0.74rem', color: 'var(--ui-text-secondary)', lineHeight: 1.5, margin: 0 }}>
            当前比赛概率会进入仅用于教育的小组模拟器。输出来自统一 Domain Model，不是实时赛事赔率。
            最可能比分：{prediction.mostLikelyScore}。
            模型稳定度：{(prediction.confidence * 100).toFixed(0)}%。
            可信自信：{formatPercent(predictionReliability.adjustedConfidence, 0)}。
          </p>
        </ExpandablePanel>
      </div>

      {/* ── Group Impact ── */}
      <div className={styles.collapsibleSection}>
        <ExpandablePanel title="小组影响" summary="出线概率视图">
          <GroupSimulator simulation={simulation} teams={teams} />
        </ExpandablePanel>
      </div>
    </div>
  );
}
