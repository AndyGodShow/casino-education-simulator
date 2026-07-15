import React from 'react';
import { SimulationPanel, StatBox } from '../../../components/SimulationPanel';
import type { SlotSimulationResult } from '../logic/SlotSimulationEngine';
import { runSlotSimulation } from '../logic/SlotSimulationEngine';
import { ALL_STRATEGIES } from '../logic/SlotStrategies';
import { formatMoney, formatSignedMoney } from '../../../components/Common/Simulation/stats';
import styles from '../../../components/Common/Simulation/Simulation.module.css';

export const SlotSimulation: React.FC = () => (
    <SimulationPanel
        title="老虎机批量模拟测试"
        defaultBaseBet={10}
        strategyOptions={ALL_STRATEGIES.map(s => ({ name: s.name, description: s.description }))}
        renderStrategyOption={(s, idx) => (
            <option key={idx} value={idx}>{s.name} - {s.description}</option>
        )}
        renderExtraControls={({ extra, setExtra }) => (
            <div className={styles.field}>
                <label htmlFor="slots-active-paylines">赔付线数:</label>
                <input
                    id="slots-active-paylines"
                    type="number"
                    value={(extra as { activeLines: number }).activeLines ?? 20}
                    onChange={e => setExtra({ activeLines: e.target.value === '' ? 20 : Number(e.target.value) })}
                    min="1"
                    max="20"
                />
            </div>
        )}
        initialExtra={{ activeLines: 20 }}
        onRun={async ({ rounds, baseBet, initialBalance, strategyIndex, extra }) => {
            const currentLines = (extra as { activeLines: number }).activeLines;
            return runSlotSimulation({
                rounds,
                initialBalance,
                baseBetPerLine: baseBet,
                activeLines: currentLines,
                strategy: ALL_STRATEGIES[strategyIndex],
            });
        }}
        renderStats={(result, ctx) => {
            const r = result as SlotSimulationResult;
            return (
                <>
                    <StatBox label="中奖次数" value={`${r.winCount} (${r.winRate.toFixed(2)}%)`} />
                    <StatBox label="未中奖" value={String(r.lossCount)} />
                    <StatBox label="最终余额" value={formatMoney(r.finalBalance)} isPositive={r.finalBalance >= ctx.initialBalance} />
                    <StatBox label="净盈亏" value={formatSignedMoney(r.netResult)} isPositive={r.netResult >= 0} />
                    <StatBox label="总下注" value={formatMoney(r.totalWagered)} />
                    <StatBox label="总赢额" value={formatMoney(r.totalWon)} />
                    <StatBox label="RTP (返还率)" value={`${r.rtp.toFixed(2)}%`} isPositive={r.rtp >= 100} />
                    <StatBox label="最大单笔赢额" value={formatMoney(r.biggestWin)} />
                    <StatBox label="收益率" value={`${((r.netResult / ctx.initialBalance) * 100).toFixed(2)}%`} isPositive={r.netResult >= 0} />
                </>
            );
        }}
    />
);
