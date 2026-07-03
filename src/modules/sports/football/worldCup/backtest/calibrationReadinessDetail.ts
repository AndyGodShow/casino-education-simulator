import type { WorldCupBacktestCalibrationReadiness } from './types';

type SourceReadinessDetailInput = {
  officialReadiness: WorldCupBacktestCalibrationReadiness;
  providerReadiness: WorldCupBacktestCalibrationReadiness;
  combinedCanUseForCalibration: boolean;
  prefix?: string;
};

const readinessDetailFor = (
  label: '官方' | '第三方',
  readiness: WorldCupBacktestCalibrationReadiness,
) => `${label}候选 ${readiness.sampleSize}/${readiness.minimumSampleSize} · 阶段 ${readiness.stageCoverage}/${readiness.minimumStageCoverage}`;

export const sourceReadinessDetail = ({
  officialReadiness,
  providerReadiness,
  combinedCanUseForCalibration,
  prefix,
}: SourceReadinessDetailInput) => {
  const baseDetail = [
    readinessDetailFor('官方', officialReadiness),
    readinessDetailFor('第三方', providerReadiness),
  ].join('；');
  const detail = prefix ? `${prefix}：${baseDetail}` : baseDetail;

  if (providerReadiness.canUseForCalibration) {
    return `${detail}（第三方不等同官方）`;
  }

  if (
    combinedCanUseForCalibration
    && !officialReadiness.canUseForCalibration
    && !providerReadiness.canUseForCalibration
  ) {
    return `${detail}；合并候选需保留来源标签`;
  }

  return detail;
};
