import React, { useState } from 'react';
import { runSlotSimulation } from '../logic/SlotSimulationEngine';
import type { SlotSimulationResult } from '../logic/SlotSimulationEngine';
import { ALL_STRATEGIES } from '../logic/SlotStrategies';
import { AssetCurve } from '../../../components/Common/Simulation/AssetCurve';
import {
    BATCH_TEST_METHODS,
    formatMoney,
    formatSignedMoney,
    getBatchTestMethod,
    resolveBatchTestConfig,
} from '../../../components/Common/Simulation/stats';
import styles from '../../../components/Common/Simulation/Simulation.module.css';
import { waitForNextFrame } from '../../../utils/deferToNextFrame';

export const SlotSimulation: React.FC = () => {
    const [rounds, setRounds] = useState<number | ''>(1000);
    const [baseBet, setBaseBet] = useState<number | ''>(10);
    const [initialBalance, setInitialBalance] = useState<number | ''>(10000);
    const [testMethod, setTestMethod] = useState('standard');
    const [activeLines, setActiveLines] = useState<number | ''>(20);
    const [strategyIdx, setStrategyIdx] = useState(0);
    const [result, setResult] = useState<SlotSimulationResult | null>(null);
    const [runContext, setRunContext] = useState({ initialBalance: 10000, rounds: 1000, baseBet: 10 });
    const [loading, setLoading] = useState(false);

    const handleRun = async () => {
        setLoading(true);
        await waitForNextFrame();
        const config = resolveBatchTestConfig(
            testMethod,
            rounds === '' ? 1000 : rounds,
            baseBet === '' ? 10 : baseBet,
            initialBalance === '' ? 10000 : initialBalance,
        );
        const currentLines = activeLines === '' ? 20 : activeLines;

        const res = runSlotSimulation({
            rounds: config.rounds,
            initialBalance: config.initialBalance,
            baseBetPerLine: config.baseBet,
            activeLines: currentLines,
            strategy: ALL_STRATEGIES[strategyIdx],
        });

        setRunContext(config);
        setResult(res);
        setLoading(false);
    };

    return (
        <div className={styles.container}>
            <h2>老虎机批量模拟测试</h2>

            <div className={styles.config}>
                <div className={styles.field}>
                    <label>测试方法:</label>
                    <select value={testMethod} onChange={(e) => setTestMethod(e.target.value)}>
                        {BATCH_TEST_METHODS.map(method => (
                            <option key={method.id} value={method.id}>{method.label}</option>
                        ))}
                    </select>
                </div>

                <div className={styles.field}>
                    <label>模拟局数:</label>
                    <input
                        type="number"
                        value={rounds}
                        onChange={(e) => setRounds(e.target.value === '' ? '' : Number(e.target.value))}
                        min="10"
                        max="100000"
                    />
                </div>

                <div className={styles.field}>
                    <label>每线注码:</label>
                    <input
                        type="number"
                        value={baseBet}
                        onChange={(e) => setBaseBet(e.target.value === '' ? '' : Number(e.target.value))}
                        min="1"
                        max="10000"
                    />
                </div>

                <div className={styles.field}>
                    <label>初始本金:</label>
                    <input
                        type="number"
                        value={initialBalance}
                        onChange={(e) => setInitialBalance(e.target.value === '' ? '' : Number(e.target.value))}
                        min="100"
                        max="1000000"
                    />
                </div>

                <div className={styles.field}>
                    <label>赔付线数:</label>
                    <input
                        type="number"
                        value={activeLines}
                        onChange={(e) => setActiveLines(e.target.value === '' ? '' : Number(e.target.value))}
                        min="1"
                        max="20"
                    />
                </div>

                <div className={styles.field}>
                    <label>下注策略:</label>
                    <select value={strategyIdx} onChange={(e) => setStrategyIdx(Number(e.target.value))}>
                        {ALL_STRATEGIES.map((s, idx) => (
                            <option key={idx} value={idx}>{s.name} - {s.description}</option>
                        ))}
                    </select>
                </div>

                <button className={styles.runBtn} onClick={handleRun} disabled={loading}>
                    {loading ? '运行中...' : '开始模拟'}
                </button>
            </div>
            <p className={styles.methodHint}>{getBatchTestMethod(testMethod).description}</p>

            {result && (
                <div className={styles.results}>
                    <h3>测试结果 ({result.rounds} / {runContext.rounds} 局)</h3>

                    <div className={styles.statsGrid}>
                        <div className={styles.statBox}>
                            <span className={styles.statLabel}>中奖次数</span>
                            <span className={styles.statValue}>{result.winCount} ({result.winRate.toFixed(2)}%)</span>
                        </div>
                        <div className={styles.statBox}>
                            <span className={styles.statLabel}>未中奖</span>
                            <span className={styles.statValue}>{result.lossCount}</span>
                        </div>
                        <div className={styles.statBox}>
                            <span className={styles.statLabel}>最终余额</span>
                            <span className={`${styles.statValue} ${result.finalBalance >= runContext.initialBalance ? styles.positive : styles.negative}`}>
                                {formatMoney(result.finalBalance)}
                            </span>
                        </div>
                        <div className={styles.statBox}>
                            <span className={styles.statLabel}>净盈亏</span>
                            <span className={`${styles.statValue} ${result.netResult >= 0 ? styles.positive : styles.negative}`}>
                                {formatSignedMoney(result.netResult)}
                            </span>
                        </div>
                        <div className={styles.statBox}>
                            <span className={styles.statLabel}>总下注</span>
                            <span className={styles.statValue}>{formatMoney(result.totalWagered)}</span>
                        </div>
                        <div className={styles.statBox}>
                            <span className={styles.statLabel}>总赢额</span>
                            <span className={styles.statValue}>{formatMoney(result.totalWon)}</span>
                        </div>
                        <div className={styles.statBox}>
                            <span className={styles.statLabel}>RTP (返还率)</span>
                            <span className={`${styles.statValue} ${result.rtp >= 100 ? styles.positive : styles.negative}`}>
                                {result.rtp.toFixed(2)}%
                            </span>
                        </div>
                        <div className={styles.statBox}>
                            <span className={styles.statLabel}>最大单笔赢额</span>
                            <span className={styles.statValue}>{formatMoney(result.biggestWin)}</span>
                        </div>
                        <div className={styles.statBox}>
                            <span className={styles.statLabel}>收益率</span>
                            <span className={`${styles.statValue} ${result.netResult >= 0 ? styles.positive : styles.negative}`}>
                                {((result.netResult / runContext.initialBalance) * 100).toFixed(2)}%
                            </span>
                        </div>
                    </div>

                    {result.balanceHistory && (
                        <AssetCurve data={result.balanceHistory} startBalance={runContext.initialBalance} />
                    )}
                </div>
            )}
        </div>
    );
};
