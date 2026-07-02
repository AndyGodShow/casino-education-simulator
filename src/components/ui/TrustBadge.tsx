import type { DataTrustInfo, DataTruthLevel } from '../../modules/core/trustLayer/dataTruth';
import styles from './SportsUi.module.css';

type TrustBadgeProps = {
  truth?: DataTrustInfo | null;
  level?: DataTruthLevel;
};

const DISPLAY_LABELS: Record<DataTruthLevel, string> = {
  local_seed: '本地模拟数据',
  sample: '示例数据',
  scaffold: '分散数据源',
  provider: '第三方数据',
  stale: '已过期数据',
  live: '官方实时数据',
};

export function TrustBadge({ truth, level }: TrustBadgeProps) {
  const trustLevel = truth?.level ?? level ?? 'local_seed';
  const label = DISPLAY_LABELS[trustLevel];

  return (
    <span
      className={`${styles.trustBadge} ${styles[`trust-${trustLevel}`]}`}
      title={truth?.description}
      aria-label={`数据可信度：${label}`}
    >
      {label}
    </span>
  );
}
