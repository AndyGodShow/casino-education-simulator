import React, { useState } from 'react';
import { runRouletteSimulation } from '../logic/RouletteSimulationEngine';
import type { RouletteSimulationResult } from '../logic/RouletteSimulationEngine';
import { AssetCurve } from '../../../components/Common/Simulation/AssetCurve';
import {
    BATCH_TEST_METHODS,
    formatMoney,
    formatPercent,
    formatSignedMoney,
    getBatchTestMethod,
    resolveBatchTestConfig,
} from '../../../components/Common/Simulation/stats';
import {
    ALL_ROULETTE_STRATEGIES,
} from '../logic/RouletteStrategies';
import styles from '../../../components/Common/Simulation/Simulation.module.css';
import { waitForNextFrame } from '../../../utils/deferToNextFrame';

export const RouletteSimulation: React.FC = () => {
    const [rounds, setRounds] = useState<number | ''>(1000);
    const [baseBet, setBaseBet] = useState<number | ''>(100);
    const [initialBalance, setInitialBalance] = useState<number | ''>(10000);
    const [testMethod, setTestMethod] = useState('standard');
    const [strategyIndex, setStrategyIndex] = useState(0);
    const [result, setResult] = useState<RouletteSimulationResult | null>(null);
    const [runContext, setRunContext] = useState({ initialBalance: 10000, rounds: 1000, baseBet: 100 });
    const [loading, setLoading] = useState(false);

    const handleRun = async () => {
        setLoading(true);
        await waitForNextFrame();
        const config = resolveBatchTestConfig(
            testMethod,
            rounds === '' ? 1000 : rounds,
            baseBet === '' ? 100 : baseBet,
            initialBalance === '' ? 10000 : initialBalance,
        );
        const strategy = ALL_ROULETTE_STRATEGIES[strategyIndex].create(config.baseBet);

        const res = runRouletteSimulation(config.rounds, strategy, config.initialBalance);
        setRunContext(config);
        setResult(res);
        setLoading(false);
    };

    return (
        <div className={styles.container}>
            <h2>轮盘批量模拟测试</h2>

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
                    <label>初始注码:</label>
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
                    <label>下注策略:</label>
                    <select value={strategyIndex} onChange={(e) => setStrategyIndex(Number(e.target.value))}>
                        {ALL_ROULETTE_STRATEGIES.map((strategy, index) => (
                            <option key={strategy.id} value={index}>{strategy.label}</option>
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
                    <h3>测试结果 ({result.totalRounds} / {runContext.rounds} 局)</h3>

                    <div className={styles.statsGrid}>
                        <div className={styles.statBox}>
                            <span className={styles.statLabel}>赢 (Win)</span>
                            <span className={styles.statValue}>{result.wins} ({formatPercent(result.wins, result.totalRounds)}%)</span>
                        </div>
                        <div className={styles.statBox}>
                            <span className={styles.statLabel}>输 (Loss)</span>
                            <span className={styles.statValue}>{result.losses} ({formatPercent(result.losses, result.totalRounds)}%)</span>
                        </div>
                        <div className={styles.statBox}>
                            <span className={styles.statLabel}>最终余额</span>
                            <span className={`${styles.statValue} ${result.finalBalance >= runContext.initialBalance ? styles.positive : styles.negative}`}>
                                {formatMoney(result.finalBalance)}
                            </span>
                        </div>
                        <div className={styles.statBox}>
                            <span className={styles.statLabel}>净盈亏</span>
                            <span className={`${styles.statValue} ${result.finalBalance >= runContext.initialBalance ? styles.positive : styles.negative}`}>
                                {formatSignedMoney(result.finalBalance - runContext.initialBalance)}
                            </span>
                        </div>
                        <div className={styles.statBox}>
                            <span className={styles.statLabel}>最高连赢</span>
                            <span className={styles.statValue}>{result.maxWinStreak}</span>
                        </div>
                        <div className={styles.statBox}>
                            <span className={styles.statLabel}>最高连输</span>
                            <span className={`${styles.statValue} ${styles.negative}`}>{result.maxLossStreak}</span>
                        </div>
                        <div className={styles.statBox}>
                            <span className={styles.statLabel}>收益率</span>
                            <span className={`${styles.statValue} ${result.finalBalance >= runContext.initialBalance ? styles.positive : styles.negative}`}>
                                {((result.finalBalance - runContext.initialBalance) / runContext.initialBalance * 100).toFixed(2)}%
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
