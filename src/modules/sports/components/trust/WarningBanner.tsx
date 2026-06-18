import type { DataTrustInfo } from '../../../core/trustLayer/dataTruth';
import styles from './TrustComponents.module.css';

type WarningBannerProps = {
  truth: DataTrustInfo;
  warnings?: string[];
};

export function WarningBanner({ truth, warnings = [] }: WarningBannerProps) {
  const generatedWarnings = [
    truth.level === 'local_seed' ? '这是本地样例数据，不是实时数据源。' : '',
    truth.level === 'sample' ? '这是样例数据，不应理解为当前真实情况。' : '',
    truth.level === 'scaffold' ? '该数据源只是预留结构，尚未启用实时数据。' : '',
    truth.level === 'stale' ? '该数据已经过期，可信度会被明显下调。' : '',
    truth.confidence < 0.4 ? '低可信度：请谨慎比较模型和市场，不要作为投注建议。' : '',
    ...warnings,
  ].filter(Boolean);

  if (generatedWarnings.length === 0) return null;

  return (
    <div className={styles.warning} role="status">
      {generatedWarnings.join(' ')}
    </div>
  );
}
