import type {
  MatchDataQualityState,
  WorldCupCalibrationStatus,
  WorldCupDataSourceTier,
  WorldCupDomainModel,
  WorldCupPredictionAuditStatus,
} from '../domain/WorldCupDomainModel';
import {
  summarizeWorldCupBacktestQuality,
  type HistoricalBacktestCsvRun,
  type HistoricalBacktestRun,
} from '../backtest';
import { ExpandablePanel } from '../../../../../components/ui/ExpandablePanel';
import { buildCombinedCalibrationPresentation } from './combinedCalibrationPresentation';
import styles from '../WorldCup.module.css';

type PredictionPipelineAuditPanelProps = {
  domain: WorldCupDomainModel;
  historicalBacktestRun?: HistoricalBacktestRun | HistoricalBacktestCsvRun;
};

const tierLabels: Record<WorldCupDataSourceTier, string> = {
  official: '官方',
  verified_provider: '第三方',
  sample: '样例',
  local: '本地',
};

const auditLabels: Record<WorldCupPredictionAuditStatus, string> = {
  passed: '已通过',
  warning: '有警告',
  failed: '未通过',
};

const calibrationLabels: Record<WorldCupCalibrationStatus, string> = {
  ready: '可初步校准',
  insufficient_sample: '样本不足',
  no_results: '未回测',
};

const countByTier = (qualities: MatchDataQualityState[]) => {
  const counts = {
    official: 0,
    verified_provider: 0,
    sample: 0,
    local: 0,
  } satisfies Record<WorldCupDataSourceTier, number>;

  for (const quality of qualities) {
    counts[quality.tier] += 1;
  }

  return counts;
};

const verdictLabel = (domain: WorldCupDomainModel) => {
  if (domain.sourceGate.canUseForRealPrediction) {
    return '当前结论：可进入真实预测口径';
  }

  return domain.sourceGate.requiresOfficialVerification
    ? '当前结论：教育模式，需官方核验'
    : '当前结论：教育模式';
};

const auditMetrics = (domain: WorldCupDomainModel) => {
  const audit = domain.predictionAudit;

  return audit.checkedMatches > 0
    ? `自检 ${audit.passedMatches}/${audit.checkedMatches} · 警告 ${audit.warningCount} · 最大漂移 ${(audit.maxProbabilityDrift * 100).toFixed(5)}pp`
    : '暂无预测样本';
};

const calibrationMetrics = (domain: WorldCupDomainModel) => {
  const calibration = domain.calibration;
  const accuracy = calibration.accuracy === null ? 'N/A' : `${(calibration.accuracy * 100).toFixed(1)}%`;
  const brier = calibration.brierScore === null ? 'N/A' : calibration.brierScore.toFixed(3);

  return `样本 ${calibration.sampleSize}/${calibration.minimumSampleSize} · Brier ${brier} · Accuracy ${accuracy}`;
};

const backtestMetrics = (domain: WorldCupDomainModel) => {
  const summary = summarizeWorldCupBacktestQuality(domain.backtest);
  const detail = summary.detail.includes(summary.nextAction)
    ? summary.detail
    : `${summary.detail} 下一步：${summary.nextAction}`;

  if (domain.backtest.overall.sampleSize === 0) {
    return {
      label: '暂无已完赛预测样本',
      detail,
    };
  }

  return {
    label: `回测样本 ${domain.backtest.overall.sampleSize}`,
    detail,
  };
};

export function PredictionPipelineAuditPanel({
  domain,
  historicalBacktestRun,
}: PredictionPipelineAuditPanelProps) {
  const qualities = Object.values(domain.matchDataQuality);
  const tierCounts = countByTier(qualities);
  const totalMatches = qualities.length;
  const realPredictionReady = qualities.filter((quality) => quality.canUseForRealPrediction).length;
  const staleOrUnknown = qualities.filter((quality) => quality.staleness !== 'fresh').length;
  const backtest = backtestMetrics(domain);
  const historicalImport = historicalBacktestRun
    ? buildCombinedCalibrationPresentation(domain, historicalBacktestRun)
    : null;

  return (
    <section className={styles.auditDisclosure} aria-label="预测线路审计">
      <ExpandablePanel title="预测线路审计" summary={verdictLabel(domain)}>
      <div className={styles.auditSummary}>
        <div>
          <span className={styles.panelKicker}>Prediction pipeline audit</span>
          <h2 id="prediction-pipeline-audit-title">预测线路审计</h2>
        </div>
        <strong className={styles.auditVerdict}>{verdictLabel(domain)}</strong>
      </div>

      <p>
        这份报告检查数据门禁、单场数据质量、推导一致性和历史校准状态；它证明链路是否自洽，
        但不把样例或第三方数据包装成真实赛事预测。
      </p>

      <div className={styles.auditGrid}>
        <div className={styles.auditCard}>
          <strong>数据门禁</strong>
          <span>{domain.sourceGate.label}</span>
          <p>{domain.sourceGate.message}</p>
        </div>

        <div className={styles.auditCard}>
          <strong>数据质量分布</strong>
          <span>
            真实预测可用 {realPredictionReady}/{totalMatches} 场 · 赛程过期/未知 {staleOrUnknown} 场
          </span>
          <div className={styles.auditPillRow} aria-label="按数据层级统计">
            {Object.entries(tierLabels).map(([tier, label]) => (
              <span key={tier} className={styles.auditPill}>
                {label} {tierCounts[tier as WorldCupDataSourceTier]}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.auditCard}>
          <strong>推导自检：{auditLabels[domain.predictionAudit.status]}</strong>
          <span>{auditMetrics(domain)}</span>
          <p>{domain.predictionAudit.message}</p>
        </div>

        <div className={styles.auditCard}>
          <strong>本届赛前快照校准：{calibrationLabels[domain.calibration.status]}</strong>
          <span>{calibrationMetrics(domain)}</span>
          <p>{domain.calibration.message}</p>
        </div>

        <div className={styles.auditCard}>
          <strong>历史回测</strong>
          <span>{backtest.label}</span>
          <p>{backtest.detail}</p>
        </div>

        {historicalImport ? (
          <div className={styles.auditCard}>
            <strong>历史导入审计</strong>
            <span>{historicalImport.auditLabel}</span>
            <p>{historicalImport.auditDetail}</p>
            <dl className={styles.auditDetailList} aria-label="历史导入审计详情">
              {historicalImport.details.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
      </ExpandablePanel>
    </section>
  );
}
