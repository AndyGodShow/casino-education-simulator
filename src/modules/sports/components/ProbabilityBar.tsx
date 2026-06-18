import styles from '../SportsLobby.module.css';

type ProbabilityBarProps = {
  label: string;
  value: number;
};

export function ProbabilityBar({ label, value }: ProbabilityBarProps) {
  const percentage = Math.max(0, Math.min(100, value * 100));

  return (
    <div className={styles.probabilityBar}>
      <div className={styles.probabilityLabel}>
        <span>{label}</span>
        <strong>{percentage.toFixed(1)}%</strong>
      </div>
      <div className={styles.probabilityTrack} aria-hidden="true">
        <span style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
