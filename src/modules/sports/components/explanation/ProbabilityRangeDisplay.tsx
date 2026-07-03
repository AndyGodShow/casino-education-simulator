import type { UnifiedProbability } from '../../../core/probability/unifiedProbability';
import styles from './ProbabilityRangeDisplay.module.css';

type ProbabilityRangeDisplayProps = {
  unifiedProbability: UnifiedProbability;
  confidence: 'low' | 'medium' | 'high';
  uncertaintyAdjustment: number | null;
  homeTeamName: string;
  awayTeamName: string;
};

function getHalfRange(confidence: 'low' | 'medium' | 'high', uncertaintyAdjustment: number | null): number {
  const base = confidence === 'high' ? 0.03 : confidence === 'medium' ? 0.06 : 0.10;
  if (uncertaintyAdjustment !== null && uncertaintyAdjustment > 0) {
    return base * (1 + uncertaintyAdjustment);
  }
  return base;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

type RangeRowData = {
  label: string;
  center: number | null;
  halfRange: number;
  fillClass: string;
  centerClass: string;
  fallback: string;
};

export function ProbabilityRangeDisplay({
  unifiedProbability,
  confidence,
  uncertaintyAdjustment,
  homeTeamName,
  awayTeamName,
}: ProbabilityRangeDisplayProps) {
  const modelHalf = getHalfRange(confidence, uncertaintyAdjustment);
  const marketHalf = 0.08; // wider range for market data
  const mergedHalf = uncertaintyAdjustment !== null ? getHalfRange(confidence, uncertaintyAdjustment) * 0.8 : modelHalf * 0.8;

  const rows: RangeRowData[] = [
    {
      label: '模型',
      center: unifiedProbability.model.home,
      halfRange: modelHalf,
      fillClass: styles.fillModel,
      centerClass: styles.centerModel,
      fallback: '无模型数据',
    },
    {
      label: '市场',
      center: unifiedProbability.market?.home ?? null,
      halfRange: marketHalf,
      fillClass: styles.fillMarket,
      centerClass: styles.centerMarket,
      fallback: '无市场数据',
    },
    {
      label: '融合',
      center: unifiedProbability.merged?.home ?? unifiedProbability.model.home,
      halfRange: mergedHalf,
      fillClass: styles.fillMerged,
      centerClass: styles.centerMerged,
      fallback: '无融合数据',
    },
  ];

  return (
    <div className={styles.panel}>
      {rows.map((row) => {
        if (row.center === null) {
          return (
            <div key={row.label} className={styles.rangeRow}>
              <span className={styles.rangeLabel}>{row.label}</span>
              <span className={styles.fallback}>{row.fallback}</span>
            </div>
          );
        }

        const low = clamp(row.center - row.halfRange);
        const high = clamp(row.center + row.halfRange);
        const lowPct = (low * 100).toFixed(1);
        const highPct = (high * 100).toFixed(1);
        const centerPct = row.center * 100;
        const fillLeft = low * 100;
        const fillWidth = (high - low) * 100;

        return (
          <div key={row.label} className={styles.rangeRow}>
            <span className={styles.rangeLabel}>{row.label}</span>
            <div className={styles.rangeTrack}>
              <div className={`${styles.rangeFill} ${row.fillClass}`} style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }} />
              <div className={`${styles.rangeCenter} ${row.centerClass}`} style={{ left: `${centerPct}%` }} />
            </div>
            <span className={styles.rangeValues}>{lowPct}% ~ {highPct}%</span>
          </div>
        );
      })}
      <div className={styles.summaryRow}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>{homeTeamName}</span>
          <span className={styles.summaryValue}>{(unifiedProbability.model.home * 100).toFixed(1)}%</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>平局</span>
          <span className={styles.summaryValue}>{(unifiedProbability.model.draw * 100).toFixed(1)}%</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>{awayTeamName}</span>
          <span className={styles.summaryValue}>{(unifiedProbability.model.away * 100).toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}
