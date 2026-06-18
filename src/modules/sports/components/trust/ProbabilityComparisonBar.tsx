import type { CSSProperties } from 'react';
import type { SourcedThreeWayProbability, UnifiedProbability } from '../../../core/probability/unifiedProbability';
import styles from './TrustComponents.module.css';

type ProbabilityComparisonBarProps = {
  probability: UnifiedProbability;
  homeLabel: string;
  awayLabel: string;
};

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

const Row = ({ label, probability, homeLabel, awayLabel }: {
  label: string;
  probability: SourcedThreeWayProbability;
  homeLabel: string;
  awayLabel: string;
}) => (
  <div className={styles.comparisonRow}>
    <span className={styles.sourceName}>{label}</span>
    <div
      className={styles.segments}
      style={{
        '--home': `${Math.max(1, probability.home * 100)}fr`,
        '--draw': `${Math.max(1, probability.draw * 100)}fr`,
        '--away': `${Math.max(1, probability.away * 100)}fr`,
      } as CSSProperties}
      aria-label={`${label}: ${homeLabel} ${formatPercent(probability.home)}, 平局 ${formatPercent(probability.draw)}, ${awayLabel} ${formatPercent(probability.away)}`}
    >
      <span className={styles.home}>{homeLabel} {formatPercent(probability.home)}</span>
      <span className={styles.draw}>平局 {formatPercent(probability.draw)}</span>
      <span className={styles.away}>{awayLabel} {formatPercent(probability.away)}</span>
    </div>
  </div>
);

export function ProbabilityComparisonBar({ probability, homeLabel, awayLabel }: ProbabilityComparisonBarProps) {
  return (
    <div className={styles.comparison}>
      <Row label="模型" probability={probability.model} homeLabel={homeLabel} awayLabel={awayLabel} />
      {probability.market && <Row label="市场" probability={probability.market} homeLabel={homeLabel} awayLabel={awayLabel} />}
      {probability.merged && <Row label="融合" probability={probability.merged} homeLabel={homeLabel} awayLabel={awayLabel} />}
    </div>
  );
}
