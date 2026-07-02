import type { BetSelection, MatchPrediction, PreMatchPredictionSnapshot, WorldCupMatch } from '../types';
import type { MarketData } from '../domain/WorldCupDomainModel';
import { StatusBadge } from '../../../../sports/ui/StatusBadge';
import type { MatchStatusUI } from '../../../../sports/ui/MatchStatusUI';
import { worldCupStageLabels } from '../stageLabels';
import styles from '../WorldCup.module.css';

type MatchCardProps = {
  match: WorldCupMatch;
  getTeamName: (teamId: string) => string;
  prediction?: MatchPrediction;
  market?: MarketData | null;
  snapshot?: PreMatchPredictionSnapshot;
  selected?: boolean;
};

const sourceLabels: Record<WorldCupMatch['source'], string> = {
  official: '官方数据',
  real: '外部数据',
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

function formatFinalScore(match: WorldCupMatch) {
  if (typeof match.homeScore === 'number' && typeof match.awayScore === 'number') {
    return `${match.homeScore} - ${match.awayScore}`;
  }

  return '- - -';
}

export function MatchCard({ match, getTeamName, prediction, market, snapshot, selected = false }: MatchCardProps) {
  const isFinished = match.status === 'finished';
  const cardClassName = [
    styles.matchCard,
    styles[`matchCard-${match.status}`],
    selected ? styles.matchCardSelected : '',
  ].filter(Boolean).join(' ');
  const topModelProbability = !isFinished && prediction
    ? Math.max(prediction.probabilities.homeWin, prediction.probabilities.draw, prediction.probabilities.awayWin)
    : null;
  const marketProbability = !isFinished
    ? market?.probabilities?.home ?? prediction?.unifiedProbability.market?.home ?? null
    : null;
  const kickoffDateLabel = !isFinished ? new Date(match.kickoff).toLocaleDateString('zh-CN') : '';
  const snapshotSelection = snapshot ? topSelection(snapshot.prediction) : null;
  const snapshotLabel = snapshotSelection
    ? selectionLabel(snapshotSelection, getTeamName(match.homeTeamId), getTeamName(match.awayTeamId))
    : null;

  return (
    <article className={cardClassName}>
      <div className={styles.matchCardMain}>
        <div className={styles.matchMetaRow}>
          <StatusBadge status={match.status as MatchStatusUI} />
          <span>{match.stage === 'group' ? `小组 ${match.group ?? '-'}` : worldCupStageLabels[match.stage]}</span>
        </div>
        <strong className={styles.matchTeams}>
          {getTeamName(match.homeTeamId)} vs {getTeamName(match.awayTeamId)}
        </strong>
      </div>
      {isFinished ? (
        <div className={styles.matchFinalScore} aria-label="最终比分">
          <span>{snapshotLabel ? `赛前预测：${snapshotLabel}` : '暂无赛前预测'}</span>
          <strong>{formatFinalScore(match)}</strong>
        </div>
      ) : (
        <>
          <div className={styles.matchProbabilityStack} aria-label="比赛概率摘要">
            <div>
              <span>模型倾向</span>
              <strong>{formatProbability(topModelProbability)}</strong>
            </div>
            <div>
              <span>市场参考</span>
              <strong>{formatProbability(marketProbability)}</strong>
            </div>
          </div>
          <div className={styles.matchExtraInfo}>
            <span>{kickoffDateLabel}</span>
            <span>{sourceLabels[match.source]}</span>
          </div>
        </>
      )}
    </article>
  );
}

function topSelection(prediction: MatchPrediction): BetSelection {
  const probabilities: Array<[BetSelection, number]> = [
    ['home', prediction.probabilities.homeWin],
    ['draw', prediction.probabilities.draw],
    ['away', prediction.probabilities.awayWin],
  ];
  return probabilities.reduce((best, current) => current[1] > best[1] ? current : best)[0];
}

function selectionLabel(
  selection: BetSelection,
  homeName: string,
  awayName: string,
) {
  if (selection === 'home') return `${homeName}胜`;
  if (selection === 'away') return `${awayName}胜`;
  return '平局';
}
