import type { WorldCupMatch } from '../../football/worldCup/types';
import type { DataTrustInfo } from '../../../core/trustLayer/dataTruth';
import styles from './TrustBreakdownPanel.module.css';

type TrustBreakdownPanelProps = {
  truth: DataTrustInfo;
  confidence: 'low' | 'medium' | 'high';
  match: WorldCupMatch;
  marketTruth: DataTrustInfo | null;
};

function computeStabilityScore(confidence: 'low' | 'medium' | 'high'): number {
  switch (confidence) {
    case 'high': return 0.85;
    case 'medium': return 0.62;
    default: return 0.38;
  }
}

function computeLiquidityScore(marketTruth: DataTrustInfo | null): number {
  if (!marketTruth) return 0;
  switch (marketTruth.level) {
    case 'live': return 0.78;
    case 'stale': return 0.35;
    case 'sample': return 0.40;
    case 'local_seed': return 0.25;
    case 'scaffold': return 0.18;
    default: return 0;
  }
}

type FreshnessResult = {
  score: number;
  description: string;
};

function computeFreshness(lastUpdated: string): FreshnessResult {
  const parsed = new Date(lastUpdated);
  const ts = parsed.getTime();
  // Handle invalid dates and epoch (0) timestamps
  if (!Number.isFinite(ts) || ts <= 0) {
    return { score: 0.10, description: '数据从未更新' };
  }
  const ageMinutes = (Date.now() - ts) / 60_000;
  if (ageMinutes < 5) return { score: 0.95, description: '数据在 5 分钟内更新' };
  if (ageMinutes < 60) return { score: 0.82, description: '数据在 1 小时内更新' };
  if (ageMinutes < 360) return { score: 0.65, description: '数据在 6 小时内更新' };
  if (ageMinutes < 1440) return { score: 0.45, description: '数据在 24 小时内更新' };
  return { score: 0.25, description: '数据已超过 24 小时未更新' };
}

function getStabilityDescription(confidence: 'low' | 'medium' | 'high'): string {
  switch (confidence) {
    case 'high': return '两队评分差距大，预测一致性高';
    case 'medium': return '两队评分存在一定差距，预测有中等程度的不确定性';
    default: return '两队评分接近，预测波动较大';
  }
}

function getLiquidityDescription(marketTruth: DataTrustInfo | null): string {
  if (!marketTruth) return '当前无市场数据可用';
  return marketTruth.description || '基于市场可信度评估';
}

type BreakdownItem = {
  label: string;
  score: number;
  fillClass: string;
  description: string;
};

export function TrustBreakdownPanel({ truth, confidence, match, marketTruth }: TrustBreakdownPanelProps) {
  const stability = computeStabilityScore(confidence);
  const liquidity = computeLiquidityScore(marketTruth);
  const freshness = computeFreshness(match.lastUpdated);

  const items: BreakdownItem[] = [
    { label: '模型稳定性', score: stability, fillClass: styles.fillStability, description: getStabilityDescription(confidence) },
    { label: '市场流动性', score: liquidity, fillClass: styles.fillLiquidity, description: getLiquidityDescription(marketTruth) },
    { label: '数据新鲜度', score: freshness.score, fillClass: styles.fillFreshness, description: freshness.description },
  ];

  return (
    <div className={styles.panel}>
      <div className={styles.overallRow}>
        <span className={styles.overallLabel}>可信度</span>
        <span className={styles.overallScore}>{(truth.confidence * 100).toFixed(0)}%</span>
      </div>
      <div className={styles.breakdownList}>
        {items.map((item) => (
          <div key={item.label} className={styles.breakdownItem}>
            <span className={styles.breakdownLabel}>{item.label}</span>
            <span className={styles.breakdownValue}>{(item.score * 100).toFixed(0)}%</span>
            <div className={styles.breakdownBar}>
              <div className={`${styles.breakdownFill} ${item.fillClass}`} style={{ width: `${item.score * 100}%` }} />
            </div>
            <span className={styles.breakdownDesc}>{item.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
