import type { BetSelection, PreMatchPredictionSnapshot, WorldCupMatch } from '../types';
import { outcomeFromScore } from '../logic/matchOutcome';
import styles from '../WorldCup.module.css';

type FinishedMatchResultPanelProps = {
  match: WorldCupMatch;
  homeName: string;
  awayName: string;
  snapshot?: PreMatchPredictionSnapshot;
};

export function FinishedMatchResultPanel({
  match,
  homeName,
  awayName,
  snapshot,
}: FinishedMatchResultPanelProps) {
  const hasVerifiedScore = typeof match.homeScore === 'number' && typeof match.awayScore === 'number';
  const predictedSelection = snapshot ? topSelection(snapshot) : null;
  const actualSelection = typeof match.homeScore === 'number' && typeof match.awayScore === 'number'
    ? outcomeFromScore(match.homeScore, match.awayScore)
    : null;
  const predictionHit = predictedSelection !== null
    && actualSelection !== null
    && predictedSelection === actualSelection;
  const selectionLabel = (selection: BetSelection) => {
    if (selection === 'home') return `${homeName}胜`;
    if (selection === 'away') return `${awayName}胜`;
    return '平局';
  };

  return (
    <section className={styles.finishedResultPanel} aria-labelledby={`finished-result-${match.id}`}>
      <div>
        <span className={styles.panelKicker}>{hasVerifiedScore ? '比赛结果' : '结果待确认'}</span>
        <h2 id={`finished-result-${match.id}`}>{homeName} vs {awayName}</h2>
        <p>
          {snapshot && hasVerifiedScore
            ? `赛前预测已于 ${new Date(snapshot.capturedAt).toLocaleString('zh-CN')} 锁定；以下内容不会用赛后数据重算。`
            : hasVerifiedScore
              ? '暂无赛前预测快照；为避免用赛后数据伪造预测，本场只展示最终比分。'
            : '比赛已超过预计结束时间，但比分数据尚未到达或尚未核验；模型预测保持隐藏。'}
        </p>
        {snapshot && hasVerifiedScore && (
          <p className={styles.finishedPredictionVerdict}>
            {predictionHit ? '预测命中' : '预测未命中'}
          </p>
        )}
      </div>
      <div className={styles.finishedComparisonGrid}>
        {snapshot && (
          <div className={styles.finishedPredictionBlock} aria-label="赛前预测">
            <span>赛前预测</span>
            <strong>{selectionLabel(predictedSelection as BetSelection)}</strong>
            <small>
              {formatPercent(snapshot.prediction.probabilities.homeWin)}
              {' / '}
              {formatPercent(snapshot.prediction.probabilities.draw)}
              {' / '}
              {formatPercent(snapshot.prediction.probabilities.awayWin)}
            </small>
          </div>
        )}
        <div
          className={styles.finishedScoreBlock}
          aria-label={hasVerifiedScore ? '最终比分' : '比赛结果待确认'}
        >
          <span>{hasVerifiedScore ? '最终比分' : '结果状态'}</span>
          <strong>{hasVerifiedScore ? `${match.homeScore} - ${match.awayScore}` : '待确认'}</strong>
        </div>
      </div>
    </section>
  );
}

function topSelection(snapshot: PreMatchPredictionSnapshot): BetSelection {
  const probabilities: Array<[BetSelection, number]> = [
    ['home', snapshot.prediction.probabilities.homeWin],
    ['draw', snapshot.prediction.probabilities.draw],
    ['away', snapshot.prediction.probabilities.awayWin],
  ];
  return probabilities.reduce((best, current) => current[1] > best[1] ? current : best)[0];
}

const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;
