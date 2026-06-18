import type { DataTrustInfo } from '../../../core/trustLayer/dataTruth';
import styles from './TrustComponents.module.css';

type ConfidenceMeterProps = {
  truth: DataTrustInfo;
  label?: string;
};

export function ConfidenceMeter({ truth, label = '可信度' }: ConfidenceMeterProps) {
  const percent = Math.round(truth.confidence * 100);
  return (
    <div className={styles.meter}>
      <div className={styles.meterLabel}>
        <span>{label}</span>
        <span>{percent}%</span>
      </div>
      <div className={styles.track} aria-hidden="true">
        <div className={styles.fill} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
