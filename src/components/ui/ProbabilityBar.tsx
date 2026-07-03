import type { CSSProperties } from 'react';
import { designTokens } from '../../modules/ui/designSystem';
import styles from './SportsUi.module.css';

type ProbabilityBarVariant = 'model' | 'market' | 'merged';

type ProbabilityBarProps = {
  label: string;
  value?: number | null;
  variant: ProbabilityBarVariant;
};

const clampProbability = (value?: number | null) => {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(Number(value))) return null;
  return Math.max(0, Math.min(1, Number(value)));
};

export function ProbabilityBar({ label, value, variant }: ProbabilityBarProps) {
  const probability = clampProbability(value);
  const percentage = probability === null ? 0 : probability * 100;
  const displayValue = probability === null ? 'N/A' : `${percentage.toFixed(1)}%`;
  const barColor = designTokens.colors.semantic[variant];

  return (
    <div
      className={`${styles.probabilityBar} ${styles[variant]}`}
      data-variant={variant}
      style={{ '--bar-color': barColor } as CSSProperties}
    >
      <div className={styles.probabilityLabel}>
        <span>{label}</span>
        <strong>{displayValue}</strong>
      </div>
      <div className={styles.probabilityTrack} aria-hidden="true">
        <span style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
