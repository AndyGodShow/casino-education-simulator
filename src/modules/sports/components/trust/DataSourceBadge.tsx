import type { DataTrustInfo, DataTruthLevel } from '../../../core/trustLayer/dataTruth';
import styles from './TrustComponents.module.css';

type DataSourceBadgeProps = {
  truth: DataTrustInfo;
};

const LABELS: Record<DataTruthLevel, string> = {
  local_seed: '本地模拟数据',
  sample: '示例数据',
  scaffold: '分散数据源',
  provider: '第三方数据',
  stale: '已过期数据',
  live: '官方实时数据',
};

export function DataSourceBadge({ truth }: DataSourceBadgeProps) {
  return <span className={styles.badge}>{LABELS[truth.level]}</span>;
}
