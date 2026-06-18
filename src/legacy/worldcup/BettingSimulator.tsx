import { useState } from 'react';
import { StatCard } from '../../modules/sports/components/StatCard';
import { calculateBettingMetrics, calculateStake, createBetSlip, settleBetSlip } from '../../modules/sports/football/worldCup/logic/bettingEngine';
import type { ThreeWayOdds } from '../../modules/sports/football/worldCup/logic/oddsEngine';
import type { BettingStrategy } from '../../modules/sports/football/worldCup/logic/bettingEngine';
import type { BetSelection, MatchPrediction, WorldCupMatch } from '../../modules/sports/football/worldCup/types';
import styles from '../../modules/sports/football/worldCup/WorldCup.module.css';

type BettingSimulatorProps = {
  match: WorldCupMatch;
  odds: ThreeWayOdds;
  prediction: MatchPrediction;
};

const probabilityBySelection = (prediction: MatchPrediction, selection: BetSelection) => ({
  home: prediction.probabilities.homeWin,
  draw: prediction.probabilities.draw,
  away: prediction.probabilities.awayWin,
}[selection]);

const selectionLabels: Record<BetSelection, string> = {
  home: '主队胜',
  draw: '平局',
  away: '客队胜',
};

export function BettingSimulator({ match, odds, prediction }: BettingSimulatorProps) {
  const [selection, setSelection] = useState<BetSelection>('home');
  const [stakeInput, setStakeInput] = useState('20');
  const [strategy, setStrategy] = useState<BettingStrategy>('fixedStake');
  const [outcome, setOutcome] = useState<BetSelection>('home');
  const bankroll = 1000;
  const baseStake = Number(stakeInput);
  const modelProbability = probabilityBySelection(prediction, selection);
  const virtualStake = Number.isFinite(baseStake) && baseStake > 0
    ? calculateStake(strategy, bankroll, baseStake, odds[selection], modelProbability)
    : 0;
  const settledBet = virtualStake > 0
    ? settleBetSlip(createBetSlip({ matchId: match.id, selection, stake: virtualStake, odds: odds[selection], modelProbability }), outcome)
    : null;
  const metrics = calculateBettingMetrics(settledBet ? [settledBet] : [], bankroll);

  return (
    <section className={styles.panel} aria-labelledby="betting-title">
      <h2 id="betting-title">模拟下注</h2>
      <p>所有下注均为虚拟资金。马丁格尔与全仓只用于破产风险教育，默认不作为可执行建议。</p>
      <div className={styles.controlGrid}>
        <label>
          选择结果
          <select value={selection} onChange={(event) => setSelection(event.target.value as BetSelection)}>
            <option value="home">主队胜</option>
            <option value="draw">平局</option>
            <option value="away">客队胜</option>
          </select>
        </label>
        <label>
          虚拟本金
          <input inputMode="decimal" value={stakeInput} onChange={(event) => setStakeInput(event.target.value)} />
        </label>
        <label>
          策略
          <select value={strategy} onChange={(event) => setStrategy(event.target.value as BettingStrategy)}>
            <option value="fixedStake">固定本金</option>
            <option value="fixedFraction">固定比例</option>
            <option value="kelly">凯利公式</option>
            <option value="halfKelly">半凯利</option>
            <option value="quarterKelly">四分之一凯利</option>
            <option value="martingale">马丁格尔风险演示</option>
          </select>
        </label>
        <label>
          样例结算
          <select value={outcome} onChange={(event) => setOutcome(event.target.value as BetSelection)}>
            <option value="home">主队胜结果</option>
            <option value="draw">平局结果</option>
            <option value="away">客队胜结果</option>
          </select>
        </label>
      </div>
      <div className={styles.statusBanner}>
        <strong>虚拟票据</strong>
        <span>{match.id} · {selectionLabels[selection]} · 本金 {virtualStake.toFixed(2)} · 赔率 {odds[selection].toFixed(2)} · 模型 {(modelProbability * 100).toFixed(1)}%</span>
      </div>
      <div className={styles.statGrid}>
        <StatCard label="总次数" value={String(metrics.totalBets)} />
        <StatCard label="胜率" value={`${(metrics.winRate * 100).toFixed(1)}%`} />
        <StatCard label="收益" value={metrics.profit.toFixed(2)} />
        <StatCard label="最大回撤" value={metrics.maxDrawdown.toFixed(2)} />
      </div>
      <div className={styles.equityCurve} aria-label="资金曲线">
        {metrics.equityCurve.map((value, index) => <span key={`${value}-${index}`} style={{ height: `${Math.max(8, Math.min(100, value / 10))}%` }} />)}
      </div>
      <button type="button" disabled aria-label="全仓风险实验需要用户主动开启风险模式">
        全仓风险实验需主动展开
      </button>
    </section>
  );
}
