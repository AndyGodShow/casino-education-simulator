import type { MatchPrediction, WorldCupMatch } from '../types';
import { StatusBadge } from '../../../../sports/ui/StatusBadge';
import type { MatchStatusUI } from '../../../../sports/ui/MatchStatusUI';
import styles from '../WorldCup.module.css';

type MatchCardProps = {
  match: WorldCupMatch;
  getTeamName: (teamId: string) => string;
  prediction?: MatchPrediction;
  selected?: boolean;
};

const sourceLabels: Record<WorldCupMatch['source'], string> = {
  real: '真实数据',
  sample: '样例数据',
  local: '本地样例',
  openfootball: 'OpenFootball',
  'api-football': 'API-Football',
  sportmonks: 'SportMonks',
  manual: '手动核验',
};

function formatProbability(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'N/A';
  return `${(Math.max(0, Math.min(1, Number(value))) * 100).toFixed(1)}%`;
}

export function MatchCard({ match, getTeamName, prediction, selected = false }: MatchCardProps) {
  const topModelProbability = prediction
    ? Math.max(prediction.probabilities.homeWin, prediction.probabilities.draw, prediction.probabilities.awayWin)
    : null;
  const marketProbability = prediction?.unifiedProbability.market?.home ?? null;
  const kickoffDate = new Date(match.kickoff);
  const cardClassName = [
    styles.matchCard,
    styles[`matchCard-${match.status}`],
    selected ? styles.matchCardSelected : '',
  ].filter(Boolean).join(' ');

  return (
    <article className={cardClassName}>
      <div className={styles.matchCardMain}>
        <div className={styles.matchMetaRow}>
          <StatusBadge status={match.status as MatchStatusUI} />
          <span>小组 {match.group ?? '-'}</span>
        </div>
        <strong className={styles.matchTeams}>
          {getTeamName(match.homeTeamId)} vs {getTeamName(match.awayTeamId)}
        </strong>
      </div>
      <div className={styles.matchProbabilityStack} aria-label="比赛概率摘要">
        <div>
          <span>模型最高项</span>
          <strong>{formatProbability(topModelProbability)}</strong>
        </div>
        <div>
          <span>市场主胜</span>
          <strong>{formatProbability(marketProbability)}</strong>
        </div>
      </div>
      <div className={styles.matchExtraInfo}>
        <span>{kickoffDate.toLocaleDateString('zh-CN')}</span>
        <span>{sourceLabels[match.source]}</span>
      </div>
    </article>
  );
}
