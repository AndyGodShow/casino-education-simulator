import type { WorldCupMatch } from '../types';
import styles from '../WorldCup.module.css';

type FinishedMatchResultPanelProps = {
  match: WorldCupMatch;
  homeName: string;
  awayName: string;
};

export function FinishedMatchResultPanel({
  match,
  homeName,
  awayName,
}: FinishedMatchResultPanelProps) {
  const hasVerifiedScore = typeof match.homeScore === 'number' && typeof match.awayScore === 'number';

  return (
    <section className={styles.finishedResultPanel} aria-labelledby={`finished-result-${match.id}`}>
      <div>
        <span className={styles.panelKicker}>{hasVerifiedScore ? '比赛结果' : '结果待确认'}</span>
        <h2 id={`finished-result-${match.id}`}>{homeName} vs {awayName}</h2>
        <p>
          {hasVerifiedScore
            ? '完赛场次只展示真实比分；模型预测已隐藏，避免把赛后结果继续包装成赛前预测。'
            : '比赛已超过预计结束时间，但比分数据尚未到达或尚未核验；模型预测保持隐藏。'}
        </p>
      </div>
      <div
        className={styles.finishedScoreBlock}
        aria-label={hasVerifiedScore ? '最终比分' : '比赛结果待确认'}
      >
        <span>{hasVerifiedScore ? '最终比分' : '结果状态'}</span>
        <strong>{hasVerifiedScore ? `${match.homeScore} - ${match.awayScore}` : '待确认'}</strong>
      </div>
    </section>
  );
}
