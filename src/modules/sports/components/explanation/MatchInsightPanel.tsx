import { useMemo } from 'react';
import type { WorldCupMatch, WorldCupTeam, MatchPrediction } from '../../football/worldCup/types';
import type { DataTrustInfo } from '../../../core/trustLayer/dataTruth';
import { ExpandablePanel } from '../../../../components/ui/ExpandablePanel';
import { ProbabilityBar } from '../../../../components/ui/ProbabilityBar';
import { TrustBadge } from '../../../../components/ui/TrustBadge';
import { getCountryDisplayName } from '../../../../utils/countryNameMap';
import { GroupSimulator } from '../../football/worldCup/components/GroupSimulator';
import type { GroupSimulationState, MarketData } from '../../football/worldCup/domain/WorldCupDomainModel';
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
  simulation?: GroupSimulationState;
  teams: Record<string, WorldCupTeam>;
};

const confidenceBand = (confidence: number): 'low' | 'medium' | 'high' => {
  if (confidence >= 0.72) return 'high';
  if (confidence >= 0.52) return 'medium';
  return 'low';
};

export function MatchInsightPanel({
  match,
  homeTeam,
  awayTeam,
  prediction,
  market,
  simulation,
  teams,
}: MatchInsightPanelProps) {
  const homeName = getCountryDisplayName(homeTeam.name);
  const awayName = getCountryDisplayName(awayTeam.name);
  const merged = prediction.unifiedProbability.merged;
  const hasMarketData = prediction.unifiedProbability.market != null;
  const stabilityBand = confidenceBand(prediction.confidence);

  const deviation = useMemo(() => market?.deviation ?? null, [market?.deviation]);

  const marketTruth: DataTrustInfo | null = prediction.unifiedProbability.market
    ? prediction.unifiedProbability.truth
    : null;

  return (
    <div className={styles.insightShell}>
      {/* ── Match Header ── */}
      <section className={styles.matchHeader}>
        <div>
          <span className={styles.sectionKicker}>比赛详情</span>
          <h2 className={styles.matchTeams}>{homeName} vs {awayName}</h2>
          <p className={styles.matchMeta}>
            小组 {match.group ?? '-'}
            {' · '}
            {new Date(match.kickoff).toLocaleString('zh-CN')}
            {' · '}
            {match.venue && match.venue !== 'Sample venue' ? match.venue : '样例场馆'}
          </p>
        </div>
        <TrustBadge truth={prediction.truth} />
      </section>

      {/* ── Probability Overview ── */}
      <section className={styles.overviewSection}>
        <span className={styles.sectionKicker}>概率概览</span>
        <ProbabilityBar label={`模型 · ${homeName}`} value={prediction.probabilities.homeWin} variant="model" />
        <ProbabilityBar label="市场参考" value={prediction.unifiedProbability.market?.home ?? null} variant="market" />
        <ProbabilityBar label={`融合概率 · ${homeName}`} value={merged?.home ?? prediction.probabilities.homeWin} variant="merged" />
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

      {/* ── Trust Breakdown ── */}
      <section className={styles.insightSection}>
        <div className={styles.sectionHeader}>
          <h3>可信度拆解</h3>
        </div>
        <TrustBreakdownPanel
          truth={prediction.truth}
          confidence={stabilityBand}
          match={match}
          marketTruth={marketTruth}
        />
      </section>

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
        <ExpandablePanel title="模拟结果摘要" summary="本地样例小组模拟">
          <p style={{ fontSize: '0.74rem', color: 'var(--ui-text-secondary)', lineHeight: 1.5, margin: 0 }}>
            当前比赛概率会进入仅用于教育的小组模拟器。输出来自统一 Domain Model，不是实时赛事赔率。
            最可能比分：{prediction.mostLikelyScore}。
            模型置信度：{(prediction.confidence * 100).toFixed(0)}%。
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
