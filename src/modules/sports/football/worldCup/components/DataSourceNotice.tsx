import { selectDataSourceStatus } from '../domain/selectors';
import type { WorldCupDomainModel } from '../domain/WorldCupDomainModel';
import styles from '../WorldCup.module.css';

type DataSourceNoticeProps = {
  domain: WorldCupDomainModel;
};

export function DataSourceNotice({ domain }: DataSourceNoticeProps) {
  const status = selectDataSourceStatus(domain);

  return (
    <section className={styles.panel} aria-labelledby="data-source-title">
      <h2 id="data-source-title">数据源状态说明</h2>
      <p>
        当前数据源：{status.label}。
        {status.isSample ? ' 当前处于样例/本地种子模式，不声明完整官方 2026 赛程准确性。' : ' 外部 provider 数据已进入统一 Domain Model。'}
      </p>
      <div className={styles.sourceGrid}>
        <div>
          <strong>{status.label}</strong>
          <span>{status.isSample ? '样例' : '启用'}</span>
          <p>最后更新：{status.lastUpdated ? new Date(status.lastUpdated).toLocaleString('zh-CN') : '暂无'}</p>
        </div>
        <div>
          <strong>错误状态</strong>
          <span>{status.errors.length > 0 ? `${status.errors.length} 条` : '无'}</span>
          <p>{status.errors[0] ?? '所有 UI、预测、解释和模拟均从同一个 domain model 读取。'}</p>
        </div>
      </div>
    </section>
  );
}
