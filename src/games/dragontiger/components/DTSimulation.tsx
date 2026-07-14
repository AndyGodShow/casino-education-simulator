import React from 'react';
import { SimulationPanel, StatBox } from '../../../components/SimulationPanel';
import type { DTSimulationResult } from '../logic/DragonTigerSimulationEngine';
import { runDragonTigerSimulation } from '../logic/DragonTigerSimulationEngine';
import { ALL_DT_STRATEGIES } from '../logic/DragonTigerStrategies';
import { formatMoney, formatPercent, formatSignedMoney } from '../../../components/Common/Simulation/stats';
import styles from '../../../components/Common/Simulation/Simulation.module.css';

export const DTSimulation: React.FC = () => (
    <SimulationPanel
        strategyOptions={ALL_DT_STRATEGIES.map(s => ({ name: s.name }))}
        strategyPosition="top"
        renderExtraControls={({ extra, setExtra }) => (
            <div className={styles.field}>
                <label htmlFor="dragon-tiger-progression-strategy">加注策略:</label>
                <select
                    id="dragon-tiger-progression-strategy"
                    value={extra.martingale ? 'martingale' : 'flat'}
                    onChange={e => setExtra({ martingale: e.target.value === 'martingale' })}
                >
                    <option value="flat">平注 (Flat Bet)</option>
                    <option value="martingale">马丁格尔 (Martingale)</option>
                </select>
            </div>
        )}
        initialExtra={{ martingale: false }}
        onRun={async ({ rounds, baseBet, initialBalance, strategyIndex, extra }) => {
            const bets = ALL_DT_STRATEGIES[strategyIndex].getBets(baseBet);
            return runDragonTigerSimulation({ rounds, initialBalance, bets, useMartingale: extra.martingale });
        }}
        renderStats={(result, ctx) => {
            const r = result as DTSimulationResult;
            return (
                <>
                    <StatBox label="龙赢 (Dragon)" value={`${r.resultDistribution.dragon} (${formatPercent(r.resultDistribution.dragon, r.totalRounds)}%)`} />
                    <StatBox label="虎赢 (Tiger)" value={`${r.resultDistribution.tiger} (${formatPercent(r.resultDistribution.tiger, r.totalRounds)}%)`} />
                    <StatBox label="和局 (Tie)" value={`${r.resultDistribution.tie} (${formatPercent(r.resultDistribution.tie, r.totalRounds)}%)`} />
                    <StatBox label="最终余额" value={formatMoney(ctx.initialBalance + r.netProfit)} isPositive={r.netProfit >= 0} />
                    <StatBox label="净盈亏" value={formatSignedMoney(r.netProfit)} isPositive={r.netProfit >= 0} />
                    <StatBox label="最高连赢" value={String(r.maxConsecutiveWins)} />
                    <StatBox label="最高连输" value={String(r.maxConsecutiveLosses)} alwaysNegative />
                </>
            );
        }}
    />
);
