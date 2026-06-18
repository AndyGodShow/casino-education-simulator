import { useMemo, useState } from 'react';
import { calculateNoVigProbabilities, calculateOverround, decimalOddsToImpliedProbability } from '../../modules/sports/football/worldCup/logic/oddsEngine';
import type { ThreeWayOdds } from '../../modules/sports/football/worldCup/logic/oddsEngine';
import type { BetSelection } from '../../modules/sports/football/worldCup/types';
import styles from '../../modules/sports/football/worldCup/WorldCup.module.css';

type OddsExplainerProps = {
  odds: ThreeWayOdds;
};

const labels: Record<BetSelection, string> = { home: 'Home', draw: 'Draw', away: 'Away' };

export function OddsExplainer({ odds }: OddsExplainerProps) {
  const [inputs, setInputs] = useState<Record<BetSelection, string>>({
    home: String(odds.home),
    draw: String(odds.draw),
    away: String(odds.away),
  });
  const parsedOdds = useMemo(() => ({
    home: Number(inputs.home),
    draw: Number(inputs.draw),
    away: Number(inputs.away),
  }), [inputs]);
  const error = (['home', 'draw', 'away'] as BetSelection[]).some((key) => !Number.isFinite(parsedOdds[key]) || parsedOdds[key] <= 1)
    ? '十进制赔率必须是大于 1 的数字。'
    : '';
  const overround = error ? 0 : calculateOverround(parsedOdds);
  const noVig = error ? null : calculateNoVigProbabilities(parsedOdds);

  return (
    <section className={styles.panel} aria-labelledby="odds-title">
      <h2 id="odds-title">赔率课堂</h2>
      <p>赔率隐含概率总和超过 100%，差额就是庄家优势的一种体现。</p>
      <div className={styles.oddsGrid}>
        {(['home', 'draw', 'away'] as BetSelection[]).map((key) => (
          <div key={key}>
            <label>
              {labels[key]} odds
              <input
                inputMode="decimal"
                value={inputs[key]}
                onChange={(event) => setInputs((current) => ({ ...current, [key]: event.target.value }))}
                aria-invalid={Boolean(error)}
              />
            </label>
            <strong>{Number.isFinite(parsedOdds[key]) ? parsedOdds[key].toFixed(2) : '--'}</strong>
            <small>隐含概率 {error ? '--' : `${(decimalOddsToImpliedProbability(parsedOdds[key]) * 100).toFixed(2)}%`}</small>
            <small>去水概率 {noVig ? `${(noVig[key] * 100).toFixed(2)}%` : '--'}</small>
          </div>
        ))}
      </div>
      {error ? <p role="alert">{error}</p> : <p>总隐含概率 {((overround + 1) * 100).toFixed(2)}% · 庄家水钱 {(overround * 100).toFixed(2)}% · 理论返还率 {(100 / (1 + overround)).toFixed(2)}%</p>}
    </section>
  );
}
