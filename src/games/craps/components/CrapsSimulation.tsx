import React from 'react';
import { SimulationPanel, StatBox } from '../../../components/SimulationPanel';
import type { CrapsSimulationResult } from '../logic/CrapsSimulationEngine';
import { runCrapsSimulation } from '../logic/CrapsSimulationEngine';
import { ALL_CRAPS_STRATEGIES } from '../logic/CrapsStrategies';
import { formatMoney, formatPercent, formatSignedMoney } from '../../../components/Common/Simulation/stats';
import styles from '../../../components/Common/Simulation/Simulation.module.css';

export const CrapsSimulationPanel: React.FC = () => (
    <SimulationPanel
        strategyOptions={ALL_CRAPS_STRATEGIES.map(s => ({ name: s.name }))}
        strategyPosition="top"
        renderExtraControls={({ extra, setExtra }) => (
            <div className={styles.field}>
                <label htmlFor="craps-progression-strategy">加注策略:</label>
                <select
                    id="craps-progression-strategy"
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
            const bets = ALL_CRAPS_STRATEGIES[strategyIndex].getBets(baseBet);
            return runCrapsSimulation({ rounds, initialBalance, bets, useMartingale: extra.martingale });
        }}
        renderStats={(result, ctx) => {
            const r = result as CrapsSimulationResult;
            return (
                <>
                    <StatBox label="胜率" value={`${formatPercent(r.wins, r.totalRounds)}%`} />
                    <StatBox label="总下注" value={formatMoney(r.totalWagered)} />
                    <StatBox label="最终余额" value={formatMoney(ctx.initialBalance + r.netProfit)} isPositive={r.netProfit >= 0} />
                    <StatBox label="净盈亏" value={formatSignedMoney(r.netProfit)} isPositive={r.netProfit >= 0} />
                    <StatBox label="RTP" value={`${r.rtp.toFixed(2)}%`} />
                    <StatBox label="最高连赢" value={String(r.maxConsecutiveWins)} />
                    <StatBox label="最高连输" value={String(r.maxConsecutiveLosses)} alwaysNegative />
                    <StatBox label="最大单轮赢" value={formatMoney(r.maxWin)} />
                </>
            );
        }}
    />
);
