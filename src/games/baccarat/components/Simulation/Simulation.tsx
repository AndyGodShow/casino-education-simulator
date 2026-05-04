
import React, { useState } from 'react';
import { runSimulation } from '../../logic/SimulationEngine';
import type { SimulationResult } from '../../logic/SimulationEngine';
import { AssetCurve } from '../../../../components/Common/Simulation/AssetCurve';
import {
    BATCH_TEST_METHODS,
    formatMoney,
    formatPercent,
    formatSignedMoney,
    getBatchTestMethod,
    resolveBatchTestConfig,
} from '../../../../components/Common/Simulation/stats';
import { FlatBetStrategy, MartingaleStrategy, AlwaysTieStrategy, RandomStrategy, MartingaleRandomStrategy } from '../../logic/Strategies';
import styles from '../../../../components/Common/Simulation/Simulation.module.css';
import { waitForNextFrame } from '../../../../utils/deferToNextFrame';

type StrategyType = 'FLAT_PLAYER' | 'FLAT_BANKER' | 'MARTINGALE_PLAYER' | 'MARTINGALE_BANKER' | 'ALWAYS_TIE' | 'RANDOM' | 'MARTINGALE_RANDOM';

export const Simulation: React.FC = () => {
    const [rounds, setRounds] = useState<number | ''>(1000);
    const [baseBet, setBaseBet] = useState<number | ''>(100);
    const [initialBalance, setInitialBalance] = useState<number | ''>(10000);
    const [testMethod, setTestMethod] = useState('standard');
    const [strategyType, setStrategyType] = useState<StrategyType>('FLAT_PLAYER');
    const [result, setResult] = useState<SimulationResult | null>(null);
    const [runContext, setRunContext] = useState({ initialBalance: 10000, rounds: 1000, baseBet: 100 });
    const [loading, setLoading] = useState(false);

    const handleRun = async () => {
        setLoading(true);
        await waitForNextFrame();
        let strategy;
        const config = resolveBatchTestConfig(
            testMethod,
            rounds === '' ? 1000 : rounds,
            baseBet === '' ? 100 : baseBet,
            initialBalance === '' ? 10000 : initialBalance,
        );
        const currentBaseBet = config.baseBet;

        switch (strategyType) {
            case 'FLAT_PLAYER':
                strategy = new FlatBetStrategy(currentBaseBet, 'PLAYER');
                break;
            case 'FLAT_BANKER':
                strategy = new FlatBetStrategy(currentBaseBet, 'BANKER');
                break;
            case 'MARTINGALE_PLAYER':
                strategy = new MartingaleStrategy(currentBaseBet, 'PLAYER');
                break;
            case 'MARTINGALE_BANKER':
                strategy = new MartingaleStrategy(currentBaseBet, 'BANKER');
                break;
            case 'ALWAYS_TIE':
                strategy = new AlwaysTieStrategy(currentBaseBet);
                break;
            case 'RANDOM':
                strategy = new RandomStrategy(currentBaseBet);
                break;
            case 'MARTINGALE_RANDOM':
                strategy = new MartingaleRandomStrategy(currentBaseBet);
                break;
            default:
                strategy = new FlatBetStrategy(currentBaseBet, 'PLAYER');
        }

        const res = runSimulation(config.rounds, strategy, config.initialBalance);
        setRunContext(config);
        setResult(res);
        setLoading(false);
    };

    return (
        <div className={styles.container}>
            <h2>批量模拟测试</h2>

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
                    <select value={strategyType} onChange={(e) => setStrategyType(e.target.value as StrategyType)}>
                        <option value="FLAT_PLAYER">平注押闲 (Flat Player)</option>
                        <option value="FLAT_BANKER">平注押庄 (Flat Banker)</option>
                        <option value="MARTINGALE_PLAYER">倍投押闲 (Martingale Player)</option>
                        <option value="MARTINGALE_BANKER">倍投押庄 (Martingale Banker)</option>
                        <option value="MARTINGALE_RANDOM">倍投随机 (Martingale Random)</option>
                        <option value="ALWAYS_TIE">全程押和 (Always Tie)</option>
                        <option value="RANDOM">随机下注 (Random)</option>
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
                            <span className={styles.statLabel}>庄赢 (Banker)</span>
                            <span className={styles.statValue}>{result.bankerWins} ({formatPercent(result.bankerWins, result.totalRounds)}%)</span>
                        </div>
                        <div className={styles.statBox}>
                            <span className={styles.statLabel}>闲赢 (Player)</span>
                            <span className={styles.statValue}>{result.playerWins} ({formatPercent(result.playerWins, result.totalRounds)}%)</span>
                        </div>
                        <div className={styles.statBox}>
                            <span className={styles.statLabel}>和局 (Tie)</span>
                            <span className={styles.statValue}>{result.ties} ({formatPercent(result.ties, result.totalRounds)}%)</span>
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
                    </div>

                    {result.balanceHistory && (
                        <AssetCurve data={result.balanceHistory} startBalance={runContext.initialBalance} />
                    )}
                </div>
            )}
        </div>
    );
};
