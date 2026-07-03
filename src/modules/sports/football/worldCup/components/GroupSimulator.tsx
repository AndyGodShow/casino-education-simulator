import { DataSourceBadge } from '../../../components/trust/DataSourceBadge';
import { WarningBanner } from '../../../components/trust/WarningBanner';
import { getCountryDisplayName } from '../../../../../utils/countryNameMap';
import type { GroupSimulationState } from '../domain/WorldCupDomainModel';
import type { WorldCupTeam } from '../types';
import styles from '../WorldCup.module.css';

const translateSimulationWarning = (warning?: string) => {
  if (!warning) return undefined;
  if (warning.includes('Local seed simulation')) {
    return '本地样例模拟：由于赛程和评分输入不是实时数据，置信区间已放宽。';
  }
  if (warning.includes('Sample data simulation')) {
    return '样例数据模拟：仅用于教育学习，不用于真实预测。';
  }
  return warning;
};

const compactWarnings = (warnings: Array<string | undefined>) => warnings.filter((warning): warning is string => Boolean(warning));

type GroupSimulatorProps = {
  simulation?: GroupSimulationState;
  teams: Record<string, WorldCupTeam>;
};

export function GroupSimulator({ simulation, teams }: GroupSimulatorProps) {
  const probabilities = (simulation?.probabilities ?? []).slice(0, 24);
  const truth = probabilities[0]?.truth;

  return (
    <section className={styles.panel} aria-labelledby="group-sim-title">
      <div className={styles.sectionHeader}>
        <h2 id="group-sim-title">可信度感知小组模拟</h2>
        {truth && <DataSourceBadge truth={truth} />}
      </div>
      <p>规则简化：积分、净胜球、进球数后使用球队编号做确定性排序，避免随机不稳定。</p>
      {truth && <WarningBanner truth={truth} warnings={compactWarnings([translateSimulationWarning(probabilities[0]?.warning)])} />}
      {probabilities.length === 0 && <p role="status">暂无可用模拟结果。</p>}
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>球队</th><th>小组第一</th><th>小组第二</th><th>第三出线</th><th>总出线</th><th>区间</th><th>出局</th></tr></thead>
          <tbody>
            {probabilities.map((row) => (
              <tr key={row.teamId}>
                <td>{getCountryDisplayName(teams[row.teamId]?.name) || row.teamId}</td>
                <td>{(row.groupWinner * 100).toFixed(1)}%</td>
                <td>{(row.groupRunnerUp * 100).toFixed(1)}%</td>
                <td>{(row.thirdPlaceQualified * 100).toFixed(1)}%</td>
                <td>{(row.qualified * 100).toFixed(1)}%</td>
                <td>{(row.confidenceInterval.lower * 100).toFixed(1)}-{(row.confidenceInterval.upper * 100).toFixed(1)}%</td>
                <td>{(row.eliminated * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
