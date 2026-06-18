import { useMemo, useState } from 'react';
import { simulateBookmaker } from '../../modules/sports/football/worldCup/logic/bookmakerEngine';
import type { BetSelection } from '../../modules/sports/football/worldCup/types';
import styles from '../../modules/sports/football/worldCup/WorldCup.module.css';

const defaultOdds: Record<BetSelection, string> = {
  home: '2.4',
  draw: '3.1',
  away: '3.6',
};

const parseInputs = (input: Record<BetSelection, string>) => ({
  home: Number(input.home),
  draw: Number(input.draw),
  away: Number(input.away),
});

export function BookmakerMode() {
  const [oddsInput, setOddsInput] = useState(defaultOdds);
  const [stakeInput, setStakeInput] = useState({ home: '5200', draw: '1600', away: '2100' });
  const odds = parseInputs(oddsInput);
  const stakes = parseInputs(stakeInput);
  const error = (['home', 'draw', 'away'] as BetSelection[]).some((key) =>
    !Number.isFinite(odds[key]) || odds[key] <= 1 || !Number.isFinite(stakes[key]) || stakes[key] < 0,
  );
  const simulation = useMemo(() => (error ? null : simulateBookmaker(odds, stakes)), [error, odds, stakes]);

  return (
    <section className={styles.panel} aria-labelledby="bookmaker-title">
      <h2 id="bookmaker-title">庄家模式</h2>
      <div className={styles.controlGrid}>
        {(['home', 'draw', 'away'] as BetSelection[]).map((key) => (
          <div key={key} className={styles.controlStack}>
            <label>
              {key} odds
              <input inputMode="decimal" value={oddsInput[key]} onChange={(event) => setOddsInput((current) => ({ ...current, [key]: event.target.value }))} />
            </label>
            <label>
              {key} virtual flow
              <input inputMode="decimal" value={stakeInput[key]} onChange={(event) => setStakeInput((current) => ({ ...current, [key]: event.target.value }))} />
            </label>
          </div>
        ))}
      </div>
      {error && <p role="alert">赔率必须大于 1，资金流必须为非负数字。</p>}
      {simulation && <p>Overround {(simulation.overround * 100).toFixed(2)}% · Theoretical payout ratio {(simulation.payoutRatio * 100).toFixed(2)}% · Risk {simulation.riskLevel}</p>}
      <div className={styles.oddsGrid}>
        {simulation?.exposures.map((exposure) => (
          <div key={exposure.outcome}>
            <span>{exposure.outcome}</span>
            <strong>{exposure.bookmakerProfitIfOutcome.toFixed(0)}</strong>
            <small>stake {exposure.totalStake} · payout {exposure.potentialPayout.toFixed(0)}</small>
          </div>
        ))}
      </div>
      <p>{simulation?.explanation.join(' ') ?? '该模拟只展示赔率结构与赔付风险，不提供真实运营建议。'}</p>
    </section>
  );
}
