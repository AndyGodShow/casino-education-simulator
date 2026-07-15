import React from 'react';
import { SimulationPanel, StatBox } from '../../../components/SimulationPanel';
import type { SGSimulationResult } from '../logic/SanGongSimulationEngine';
import { runSanGongSimulation } from '../logic/SanGongSimulationEngine';
import { ALL_SG_STRATEGIES } from '../logic/SanGongStrategies';
import { formatMoney, formatPercent, formatSignedMoney } from '../../../components/Common/Simulation/stats';
import styles from '../../../components/Common/Simulation/Simulation.module.css';

export const SGSimulation: React.FC = () => (
    <SimulationPanel
        strategyOptions={ALL_SG_STRATEGIES.map(s => ({ name: s.name }))}
        strategyPosition="top"
        renderExtraControls={({ extra, setExtra }) => (
            <div className={styles.field}>
                <label htmlFor="san-gong-progression-strategy">加注策略:</label>
                <select
                    id="san-gong-progression-strategy"
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
            const bets = ALL_SG_STRATEGIES[strategyIndex].getBets(baseBet);
            return runSanGongSimulation({ rounds, initialBalance, bets, useMartingale: extra.martingale });
        }}
        renderStats={(result, ctx) => {
            const r = result as SGSimulationResult;
            return (
                <>
                    <StatBox label="闲赢 (Player)" value={`${r.resultDistribution.player_wins} (${formatPercent(r.resultDistribution.player_wins, r.totalRounds)}%)`} />
                    <StatBox label="庄赢 (Banker)" value={`${r.resultDistribution.banker_wins} (${formatPercent(r.resultDistribution.banker_wins, r.totalRounds)}%)`} />
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
