import { ConfidenceMeter } from '../../modules/sports/components/trust/ConfidenceMeter';
import { DataSourceBadge } from '../../modules/sports/components/trust/DataSourceBadge';
import { ProbabilityComparisonBar } from '../../modules/sports/components/trust/ProbabilityComparisonBar';
import { WarningBanner } from '../../modules/sports/components/trust/WarningBanner';
import { getCountryDisplayName } from '../../utils/countryNameMap';
import type { MatchPrediction, WorldCupMatch, WorldCupTeam } from '../../modules/sports/football/worldCup/types';
import styles from '../../modules/sports/football/worldCup/WorldCup.module.css';

type MatchPredictorProps = {
  match: WorldCupMatch;
  prediction?: MatchPrediction | null;
  homeTeam?: WorldCupTeam | null;
  awayTeam?: WorldCupTeam | null;
};

export function MatchPredictor({ prediction, homeTeam, awayTeam }: MatchPredictorProps) {
  if (!homeTeam || !awayTeam || !prediction) {
    return (
      <section className={styles.panel} aria-labelledby="predictor-title">
        <h2 id="predictor-title">单场比赛预测</h2>
        <p role="status">缺少 Domain 预测数据，无法展示演示预测。</p>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="predictor-title">
      <div className={styles.sectionHeader}>
        <h2 id="predictor-title">概率面板</h2>
        <DataSourceBadge truth={prediction.truth} />
      </div>
      <p>{getCountryDisplayName(homeTeam.name)} vs {getCountryDisplayName(awayTeam.name)} · 预期进球 {prediction.expectedGoals.home.toFixed(2)} - {prediction.expectedGoals.away.toFixed(2)} · 最可能比分 {prediction.mostLikelyScore} · 置信度 {(prediction.confidence * 100).toFixed(0)}%</p>
      <ProbabilityComparisonBar probability={prediction.unifiedProbability} homeLabel={getCountryDisplayName(homeTeam.name)} awayLabel={getCountryDisplayName(awayTeam.name)} />
      <ConfidenceMeter truth={prediction.truth} label="模型数据可信度" />
      <WarningBanner truth={prediction.truth} />
      <div className={styles.factorList}>
        {prediction.explanation.factors.map((factor) => (
          <span key={factor.name}>{factor.name}: {factor.description}</span>
        ))}
      </div>
    </section>
  );
}
