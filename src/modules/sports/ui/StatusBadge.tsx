import { MatchStatusUI, matchStatusLabel } from './MatchStatusUI';
import styles from './StatusBadge.module.css';

type StatusBadgeProps = {
  status: MatchStatusUI;
};

const statusClass: Record<MatchStatusUI, string> = {
  [MatchStatusUI.SCHEDULED]: styles.scheduled,
  [MatchStatusUI.LIVE]: styles.live,
  [MatchStatusUI.FINISHED]: styles.finished,
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`${styles.badge} ${statusClass[status]}`}>
      <span aria-hidden="true" />
      {matchStatusLabel[status]}
    </span>
  );
}
