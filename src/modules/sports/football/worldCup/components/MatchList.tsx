import { useMemo, useState } from 'react';
import { MatchCard } from './MatchCard';
import type { MatchPrediction, WorldCupMatch } from '../types';
import { MatchStatusUI, matchStatusLabel } from '../../../../sports/ui/MatchStatusUI';
import styles from '../WorldCup.module.css';

type MatchListProps = {
  matches: WorldCupMatch[];
  getTeamName: (teamId: string) => string;
  getPrediction: (matchId: string) => MatchPrediction | undefined;
  selectedMatchId?: string;
  onSelectMatch: (matchId: string) => void;
};

export function MatchList({ matches, getTeamName, getPrediction, selectedMatchId, onSelectMatch }: MatchListProps) {
  const [groupFilter, setGroupFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const visibleMatches = useMemo(() => matches.filter((match) =>
    (groupFilter === 'all' || match.group === groupFilter) &&
    (statusFilter === 'all' || match.status === statusFilter),
  ), [groupFilter, matches, statusFilter]);
  const groups = useMemo(
    () => Array.from(new Set(matches.flatMap((match) => (match.group ? [match.group] : [])))).sort(),
    [matches],
  );
  const groupOptions = ['all', ...groups] as const;

  return (
    <section className={styles.feedPanel} aria-labelledby="match-list-title">
      <div className={styles.sectionHeader}>
        <div>
          <span className={styles.panelKicker}>比赛列表</span>
          <h2 id="match-list-title">世界杯比赛列表</h2>
        </div>
        <small>{visibleMatches.length} 场样例</small>
      </div>
      <div className={styles.filterBar}>
        <div className={styles.groupSelector} aria-label="选择小组">
          <span>小组</span>
          <div className={styles.groupSelectorGrid}>
            {groupOptions.map((group) => {
              const isActive = groupFilter === group;
              const label = group === 'all' ? '全部' : group;

              return (
                <button
                  key={group}
                  type="button"
                  className={`${styles.groupOption} ${isActive ? styles.groupOptionActive : ''}`}
                  onClick={() => setGroupFilter(group)}
                  aria-pressed={isActive}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <label>
          状态
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">全部状态</option>
            <option value={MatchStatusUI.SCHEDULED}>{matchStatusLabel.scheduled}</option>
            <option value={MatchStatusUI.LIVE}>{matchStatusLabel.live}</option>
            <option value={MatchStatusUI.FINISHED}>{matchStatusLabel.finished}</option>
          </select>
        </label>
      </div>
      <div className={styles.matchGrid}>
        {visibleMatches.slice(0, 12).map((match) => {
          const prediction = getPrediction(match.id);

          return (
            <button
              key={match.id}
              type="button"
              className={styles.matchButton}
              onClick={() => onSelectMatch(match.id)}
              aria-pressed={match.id === selectedMatchId}
            >
              <MatchCard
                match={match}
                getTeamName={getTeamName}
                prediction={prediction}
                selected={match.id === selectedMatchId}
              />
            </button>
          );
        })}
      </div>
      {visibleMatches.length === 0 && <p role="status">当前筛选没有样例比赛。请切换小组或状态。</p>}
    </section>
  );
}
