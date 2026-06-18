import { MarketQualityBadge } from '../../modules/sports/components/MarketQualityBadge';
import { ConfidenceMeter } from '../../modules/sports/components/trust/ConfidenceMeter';
import { DataSourceBadge } from '../../modules/sports/components/trust/DataSourceBadge';
import { WarningBanner } from '../../modules/sports/components/trust/WarningBanner';
import { marketQualityScore } from '../../dataProviders/polymarket/adapters';
import { evaluateMarketTruth } from '../../modules/core/trustLayer/trustEvaluator';
import { usePolymarketReference } from './usePolymarketReference';
import type { WorldCupMatch } from '../../modules/sports/football/worldCup/types';
import styles from '../../modules/sports/football/worldCup/WorldCup.module.css';

type MarketReferencePanelProps = {
  match?: WorldCupMatch;
};

export function MarketReferencePanel({ match }: MarketReferencePanelProps) {
  const reference = usePolymarketReference(match?.id);
  const quality = marketQualityScore({ liquidity: 0, volume: 0, spread: 0.2, freshnessMs: 999999 });
  const truth = reference.truth ?? evaluateMarketTruth(null);
  const qualityLabel = {
    high: '高',
    medium: '中',
    low: '低',
  }[quality.level];

  return (
    <section className={styles.panel} aria-labelledby="market-title">
      <div className={styles.sectionHeader}>
        <h2 id="market-title">市场参考</h2>
        <DataSourceBadge truth={truth} />
      </div>
      <MarketQualityBadge quality={quality} />
      <ConfidenceMeter truth={truth} label="市场数据可信度" />
      <WarningBanner truth={truth} warnings={quality.warnings} />
      <p>市场价格代表交易者用资金表达的共识，但会受流动性、价差、情绪、信息延迟和市场规则影响。它只能作为概率参考，不能作为真实概率答案。</p>
      <p>市场概率：当前样例比赛暂无可用市场数据。可信度分数：{Math.round(truth.confidence * 100)}%。数据质量：{qualityLabel}。</p>
      <p>{match ? `当前样例比赛：${match.id}。` : ''}{reference.message}</p>
      <p>差异较大但市场质量较低时，可能由低流动性或价差过大导致，不应过度解读。</p>
    </section>
  );
}
