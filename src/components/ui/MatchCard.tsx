import type { DataTrustInfo } from '../../modules/core/trustLayer/dataTruth';
import { ProbabilityBar } from './ProbabilityBar';
import { TrustBadge } from './TrustBadge';
import styles from './SportsUi.module.css';

type MatchProbability = {
  label: string;
  value?: number | null;
};

type MatchCardProps = {
  homeTeam: string;
  awayTeam: string;
  meta?: string;
  modelProbability: MatchProbability;
  marketProbability?: MatchProbability;
  trust?: DataTrustInfo | null;
  selected?: boolean;
};

export function MatchCard({
  homeTeam,
  awayTeam,
  meta,
  modelProbability,
  marketProbability,
  trust,
  selected = false,
}: MatchCardProps) {
  return (
    <article className={`${styles.matchCard} ${selected ? styles.matchCardSelected : ''}`}>
      <div className={styles.matchTeams}>
        {meta && <span>{meta}</span>}
        <strong>{homeTeam} vs {awayTeam}</strong>
      </div>
      <div className={styles.matchBars}>
        <ProbabilityBar label={modelProbability.label} value={modelProbability.value} variant="model" />
        {marketProbability && (
          <ProbabilityBar label={marketProbability.label} value={marketProbability.value} variant="market" />
        )}
      </div>
      <TrustBadge truth={trust} />
    </article>
  );
}
