import type { MarketQuality } from '../../../dataProviders/polymarket/types';
import styles from '../SportsLobby.module.css';

type MarketQualityBadgeProps = {
  quality: MarketQuality;
};

export function MarketQualityBadge({ quality }: MarketQualityBadgeProps) {
  const levelLabel = {
    high: '高',
    medium: '中',
    low: '低',
  }[quality.level];

  return (
    <span className={`${styles.qualityBadge} ${styles[`quality${quality.level}`]}`}>
      市场质量 {levelLabel} · {quality.score}/100
    </span>
  );
}
