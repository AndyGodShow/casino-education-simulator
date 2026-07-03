import type { PredictionFactor } from '../../football/worldCup/types';
import type { ModelMarketDeviation } from '../../football/worldCup/logic/oddsEngine';
import styles from './ProbabilityExplanationPanel.module.css';

type ProbabilityExplanationPanelProps = {
  factors: PredictionFactor[];
  deviation: ModelMarketDeviation | null;
  hasMarketData: boolean;
  homeTeamName: string;
  awayTeamName: string;
};

const factorLabels: Record<string, string> = {
  'Team strength gap': '球队强度差',
  'Form factor': '近期状态',
  'Goal expectation model': '预期进球模型',
  'Match context factor': '比赛语境',
};

const factorDescriptionI18n: Record<string, string> = {
  'Team strength gap': '综合球队评分、进攻和对手防守匹配关系。',
  'Form factor': '使用近期表现代理值；缺失时回退到评分基线。',
  'Goal expectation model': '把预期进球转成泊松比分矩阵和胜平负概率。',
  'Match context factor': '加入受限的主办地与阶段压力调整。',
};

const marketItems = [
  { title: '流动性影响', desc: '市场深度不足时，小额交易即可显著影响价格。低流动性市场中的赔率可能无法准确反映真实概率。' },
  { title: '情绪偏差', desc: '公众投注倾向可能导致价格偏离真实概率。热门球队往往被过度投注，赔率被压低。' },
  { title: '数据延迟', desc: '市场数据更新可能存在数秒到数分钟的延迟，价格变化并不总是即时反映最新信息。' },
  { title: '交易深度', desc: '订单簿深度影响大额交易的价格滑点。浅层订单簿意味着较大的买卖价差和更低的定价效率。' },
];

function getDirectionLabel(impact: number, home: string, away: string): { text: string; className: string } {
  if (impact > 0.04) return { text: `→ ${home}`, className: styles.directionHome };
  if (impact < -0.04) return { text: `→ ${away}`, className: styles.directionAway };
  return { text: '↔ 中性', className: styles.directionNeutral };
}

function getDeltaLevel(score: number): 'low' | 'medium' | 'high' {
  if (score < 0.15) return 'low';
  if (score < 0.35) return 'medium';
  return 'high';
}

const deltaLevelLabels: Record<'low' | 'medium' | 'high', string> = {
  low: '较小',
  medium: '中等',
  high: '较大',
};

const deltaLevelClass: Record<'low' | 'medium' | 'high', keyof typeof styles> = {
  low: 'deltaLow',
  medium: 'deltaMedium',
  high: 'deltaHigh',
};

export function ProbabilityExplanationPanel({
  factors,
  deviation,
  hasMarketData,
  homeTeamName,
  awayTeamName,
}: ProbabilityExplanationPanelProps) {
  const maxImpact = Math.max(...factors.map((f) => Math.abs(f.impact)), 1);

  return (
    <div className={styles.panel}>
      {/* ── Model Explanation ── */}
      <div>
        <h4 className={styles.sectionTitle}>模型解释</h4>
        <div className={styles.factorGrid}>
          {factors.map((factor) => {
            const dir = getDirectionLabel(factor.impact, homeTeamName, awayTeamName);
            return (
              <div key={factor.name} className={styles.factorRow}>
                <span className={styles.factorLabel}>{factorLabels[factor.name] ?? factor.name}</span>
                <span className={styles.factorDesc}>{factorDescriptionI18n[factor.name] ?? factor.description}</span>
                <span className={dir.className}>{dir.text}</span>
                <div className={styles.weightBar}>
                  <div
                    className={styles.weightFill}
                    style={{ width: `${(Math.abs(factor.impact) / maxImpact) * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Market Explanation ── */}
      <div>
        <h4 className={styles.sectionTitle}>市场解释</h4>
        {hasMarketData ? (
          <div className={styles.marketList}>
            {marketItems.map((item) => (
              <div key={item.title} className={styles.marketItem}>
                <p className={styles.marketItemTitle}>{item.title}</p>
                <p className={styles.marketItemDesc}>{item.desc}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.fallbackText}>
            当前无实时市场数据，以下为市场机制的教育性说明。当接入实时数据后，将展示实际市场偏差分析。
          </p>
        )}
      </div>

      {/* ── Delta Analysis ── */}
      <div>
        <h4 className={styles.sectionTitle}>模型 vs 市场差异</h4>
        {deviation ? (() => {
          const level = getDeltaLevel(deviation.deviationScore);
          const label = deltaLevelLabels[level];
          return (
          <>
            <div className={styles.deltaHeader}>
              <span className={`${styles.deltaScore} ${styles[deltaLevelClass[level]]}`}>
                偏差指数: {deviation.deviationScore.toFixed(3)}
              </span>
              <span className={styles.deltaDetail}>
                {label}分歧
                {' · '}
                不确定性调整: {(deviation.uncertaintyAdjustment * 100).toFixed(0)}%
              </span>
            </div>
            <div className={styles.deltaList}>
              {(['home', 'draw', 'away'] as const).map((outcome) => {
                const diff = deviation.expectedValueDifference[outcome];
                const label = outcome === 'home' ? homeTeamName : outcome === 'away' ? awayTeamName : '平局';
                const direction = diff > 0.02 ? '模型更看好' : diff < -0.02 ? '市场更看好' : '基本一致';
                const colorClass = diff > 0.02 ? styles.directionHome : diff < -0.02 ? styles.directionAway : styles.directionNeutral;
                return (
                  <div key={outcome} className={styles.deltaRow}>
                    <span>{label}</span>
                    <span className={`${styles.deltaDirection} ${colorClass}`}>{direction}</span>
                    <span className={styles.deltaDetail}>(差异: {(diff * 100).toFixed(1)}%)</span>
                  </div>
                );
              })}
            </div>
          </>
        )})() : (
          <p className={styles.fallbackText}>偏差数据不可用。需要市场数据才能计算模型与市场的差异。</p>
        )}
      </div>
    </div>
  );
}
