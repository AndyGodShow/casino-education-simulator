import { StatCard } from '../../modules/sports/components/StatCard';
import type { WorldCupMatch } from '../../modules/sports/football/worldCup/types';
import styles from '../../modules/sports/football/worldCup/WorldCup.module.css';

type WorldCupDashboardProps = {
  matches?: WorldCupMatch[];
  selectedMatch?: WorldCupMatch;
  virtualBalance: number;
  recentSimulation: string;
};

export function WorldCupDashboard({ matches = [], selectedMatch, virtualBalance, recentSimulation }: WorldCupDashboardProps) {
  const sourceLabel = selectedMatch?.source ?? matches[0]?.source ?? 'local';
  const groupCount = new Set(matches.flatMap((match) => (match.group ? [match.group] : []))).size;
  const teamCount = new Set(matches.flatMap((match) => [match.homeTeamId, match.awayTeamId])).size;

  return (
    <section className={styles.dashboard} aria-label="世界杯模块概览">
      <div className={styles.statusBanner}>
        <strong>当前数据模式：{sourceLabel}</strong>
        <span>Provider scaffold disabled. No wallet, no real orders.</span>
      </div>
      <div className={styles.statGrid}>
        <StatCard label="Matches" value={String(matches.length)} detail={`${sourceLabel} data`} />
        <StatCard label="Groups" value={String(groupCount)} detail="derived from domain matches" />
        <StatCard label="Sim Teams" value={String(teamCount)} detail="derived from domain matches" />
        <StatCard label="Virtual Balance" value={virtualBalance.toFixed(0)} detail="education only" />
      </div>
      <p>
        当前选中：{selectedMatch?.id ?? '暂无'} · 最近模拟：{recentSimulation}。所有输出用于概率教育，不能作为真实投注建议。
      </p>
    </section>
  );
}
