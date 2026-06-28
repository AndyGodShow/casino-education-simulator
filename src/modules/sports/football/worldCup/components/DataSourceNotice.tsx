import { selectDataSourceStatus } from '../domain/selectors';
import type { WorldCupDomainModel } from '../domain/WorldCupDomainModel';
import type { MatchAdvancedMetricTrust } from '../types';
import { ExpandablePanel } from '../../../../../components/ui/ExpandablePanel';
import {
  summarizeWorldCupBacktestQuality,
  type HistoricalBacktestCsvRun,
  type HistoricalBacktestRun,
} from '../backtest';
import { buildCombinedCalibrationPresentation } from './combinedCalibrationPresentation';
import styles from '../WorldCup.module.css';

type DataSourceNoticeProps = {
  domain: WorldCupDomainModel;
  historicalBacktestRun?: HistoricalBacktestRun | HistoricalBacktestCsvRun;
};

function summarizeReliability(domain: WorldCupDomainModel) {
  const states = Object.values(domain.predictionReliability);
  if (states.length === 0) {
    return {
      label: '暂无可靠性样本',
      detail: '还没有可用于自信校正的单场预测。等待赛程和球队数据进入 domain model。',
    };
  }

  const averageAdjusted = states.reduce((sum, state) => sum + state.adjustedConfidence, 0) / states.length;
  const lowCount = states.filter((state) => state.label === 'low').length;
  const deductionCount = states.reduce((sum, state) => sum + state.deductions.length, 0);

  return {
    label: `平均 ${(averageAdjusted * 100).toFixed(1)}%`,
    detail: `低自信 ${lowCount}/${states.length} 场 · 扣分项 ${deductionCount} 条。该值已按数据源、输入覆盖率、校准和链路自检做保守折扣。`,
  };
}

function summarizeAdvancedMetricTrust(domain: WorldCupDomainModel) {
  const trustStates = Object.values(domain.predictionReliability)
    .map((state) => state.advancedMetricTrust)
    .filter((trust): trust is MatchAdvancedMetricTrust => Boolean(trust && trust.availableFields > 0));

  if (trustStates.length === 0) {
    return {
      label: '暂无来源样本',
      detail: '还没有可聚合的高级指标 provenance。当前自信主要依赖数据源、覆盖率、校准和链路自检。',
    };
  }

  const availableFields = trustStates.reduce((sum, trust) => sum + trust.availableFields, 0);
  const sourcedFields = trustStates.reduce((sum, trust) => sum + trust.sourcedFields, 0);
  const weightedTrustScore = trustStates.reduce(
    (sum, trust) => sum + trust.averageTrustScore * trust.availableFields,
    0,
  ) / availableFields;
  const lowTrustFields = trustStates.reduce((sum, trust) => sum + trust.lowTrustFields, 0);
  const staleOrUnknownFields = trustStates.reduce(
    (sum, trust) => sum + trust.staleFields.length + trust.unknownFreshnessFields.length,
    0,
  );
  const sourceCoverage = sourcedFields / availableFields;

  return {
    label: `来源覆盖 ${(sourceCoverage * 100).toFixed(1)}%`,
    detail: `平均信任 ${(weightedTrustScore * 100).toFixed(1)}% · 低信任字段 ${lowTrustFields} · 过期/未知更新时间 ${staleOrUnknownFields}。高级指标只影响可信自信，不会把第三方或 seed 数据伪装成官方数据。`,
  };
}

function summarizeBacktest(domain: WorldCupDomainModel) {
  return summarizeWorldCupBacktestQuality(domain.backtest);
}

const withNextAction = (detail: string, nextAction: string) => (
  detail.includes(nextAction) ? detail : `${detail} 下一步：${nextAction}`
);

export function DataSourceNotice({ domain, historicalBacktestRun }: DataSourceNoticeProps) {
  const status = selectDataSourceStatus(domain);
  const calibration = domain.calibration;
  const audit = domain.predictionAudit;
  const sourceGate = domain.sourceGate;
  const reliabilitySummary = summarizeReliability(domain);
  const advancedMetricTrustSummary = summarizeAdvancedMetricTrust(domain);
  const backtestSummary = summarizeBacktest(domain);
  const combinedCalibrationSummary = historicalBacktestRun
    ? buildCombinedCalibrationPresentation(domain, historicalBacktestRun)
    : null;
  const calibrationLabel = calibration.status === 'ready'
    ? '可初步校准'
    : calibration.status === 'insufficient_sample'
      ? '样本不足'
      : '未回测';
  const calibrationMetrics = calibration.sampleSize > 0
    ? `样本 ${calibration.sampleSize}/${calibration.minimumSampleSize} · Brier ${calibration.brierScore?.toFixed(3) ?? 'N/A'} · Accuracy ${calibration.accuracy === null ? 'N/A' : `${(calibration.accuracy * 100).toFixed(1)}%`}`
    : `样本 0/${calibration.minimumSampleSize}`;
  const auditLabel = audit.status === 'passed'
    ? '已通过'
    : audit.status === 'warning'
      ? '有警告'
      : '未通过';
  const auditMetrics = audit.checkedMatches > 0
    ? `自检 ${audit.passedMatches}/${audit.checkedMatches} · 警告 ${audit.warningCount} · 最大漂移 ${(audit.maxProbabilityDrift * 100).toFixed(5)}pp`
    : '暂无预测样本';
  const sourceGateLabel = sourceGate.canUseForRealPrediction
    ? '真实预测可用'
    : sourceGate.requiresOfficialVerification
      ? '需官方核验'
      : '教育模式';

  return (
    <section className={styles.auditDisclosure} aria-label="数据源状态说明">
      <ExpandablePanel title="数据源状态说明" summary={`${status.label} · ${sourceGateLabel}`}>
      <p>
        当前数据源：{status.label}。
        {' '}
        {status.detail}
      </p>
      <div className={styles.sourceGrid}>
        <div>
          <strong>{status.label}</strong>
          <span>{status.isLiveProvider ? '第三方启用' : '演示数据'}</span>
          <p>最后更新：{status.lastUpdated ? new Date(status.lastUpdated).toLocaleString('zh-CN') : '暂无'}</p>
        </div>
        <div>
          <strong>预测口径</strong>
          <span>{status.isSample ? '教育估计' : '模型估计'}</span>
          <p>{status.predictionCaveat}</p>
        </div>
        <div>
          <strong>数据门禁</strong>
          <span>{sourceGateLabel}</span>
          <p>{sourceGate.label}。{sourceGate.message}</p>
        </div>
        <div>
          <strong>模型校准</strong>
          <span>{calibrationLabel}</span>
          <p>{calibrationMetrics}。{calibration.message}</p>
        </div>
        <div>
          <strong>链路自检</strong>
          <span>{auditLabel}</span>
          <p>{auditMetrics}。{audit.message}</p>
        </div>
        <div>
          <strong>自信校正</strong>
          <span>{reliabilitySummary.label}</span>
          <p>{reliabilitySummary.detail}</p>
        </div>
        <div>
          <strong>高级指标来源</strong>
          <span>{advancedMetricTrustSummary.label}</span>
          <p>{advancedMetricTrustSummary.detail}</p>
        </div>
        <div>
          <strong>历史回测</strong>
          <span>{backtestSummary.label}</span>
          <p>{withNextAction(backtestSummary.detail, backtestSummary.nextAction)}</p>
        </div>
        {combinedCalibrationSummary ? (
          <div>
            <strong>合并校准证据</strong>
            <span>{combinedCalibrationSummary.noticeLabel}</span>
            <p>{combinedCalibrationSummary.noticeDetail}</p>
          </div>
        ) : null}
        <div>
          <strong>错误状态</strong>
          <span>{status.errors.length > 0 ? `${status.errors.length} 条` : '无'}</span>
          <p>{status.errors[0] ?? '所有 UI、预测、解释和模拟均从同一个 domain model 读取。'}</p>
        </div>
      </div>
      </ExpandablePanel>
    </section>
  );
}
