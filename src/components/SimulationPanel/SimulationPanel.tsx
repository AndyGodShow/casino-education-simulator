import React, { useState, useCallback, type ReactNode } from 'react';
import { AssetCurve } from '../Common/Simulation/AssetCurve';
import {
    BATCH_TEST_METHODS,
    getBatchTestMethod,
    MAIN_THREAD_SIMULATION_WARNING,
    resolveBatchTestConfig,
} from '../Common/Simulation/stats';
import styles from '../Common/Simulation/Simulation.module.css';
import { waitForNextFrame } from '../../utils/deferToNextFrame';

export interface StatBoxProps {
    label: string;
    value: string;
    isPositive?: boolean;
    alwaysNegative?: boolean;
}

export const StatBox: React.FC<StatBoxProps> = ({ label, value, isPositive, alwaysNegative }) => (
    <div className={styles.statBox}>
        <span className={styles.statLabel}>{label}</span>
        <span className={`${styles.statValue} ${
            alwaysNegative ? styles.negative
                : isPositive === true ? styles.positive
                    : isPositive === false ? styles.negative
                        : ''
        }`}>
            {value}
        </span>
    </div>
);

export interface StrategyOption {
    name: string;
    description?: string;
}

export interface RunParams<TExtra extends Record<string, unknown> = Record<string, unknown>> {
    rounds: number;
    baseBet: number;
    initialBalance: number;
    strategyIndex: number;
    extra: TExtra;
}

export interface ExtraControlsCtx<TExtra extends Record<string, unknown> = Record<string, unknown>> {
    extra: TExtra;
    setExtra: (extra: TExtra) => void;
}

export interface SimulationPanelProps<TExtra extends Record<string, unknown> = Record<string, unknown>> {
    title?: string;
    strategyOptions: StrategyOption[];
    strategyPosition?: 'top' | 'bottom';
    renderStrategyOption?: (option: StrategyOption, idx: number) => ReactNode;
    renderExtraControls?: (ctx: ExtraControlsCtx<TExtra>) => ReactNode;
    onRun: (params: RunParams<TExtra>) => Promise<{ balanceHistory?: number[]; totalRounds?: number; rounds?: number }>;
    renderStats: (result: unknown, context: { initialBalance: number; rounds: number; baseBet: number }) => ReactNode;
    defaultBaseBet?: number;
    defaultRounds?: number;
    initialExtra?: TExtra;
}

const DEFAULT_BASE_BET = 100;
const DEFAULT_ROUNDS = 1000;
const DEFAULT_BALANCE = 10000;

export function SimulationPanel<TExtra extends Record<string, unknown> = Record<string, unknown>>({
    title = '批量模拟测试',
    strategyOptions,
    strategyPosition = 'bottom',
    renderStrategyOption,
    renderExtraControls,
    onRun,
    renderStats,
    defaultBaseBet = DEFAULT_BASE_BET,
    defaultRounds = DEFAULT_ROUNDS,
    initialExtra = {} as TExtra,
}: SimulationPanelProps<TExtra>) {
    const [rounds, setRounds] = useState<number | ''>(defaultRounds);
    const [baseBet, setBaseBet] = useState<number | ''>(defaultBaseBet);
    const [initialBalance, setInitialBalance] = useState<number | ''>(DEFAULT_BALANCE);
    const [testMethod, setTestMethod] = useState('standard');
    const [strategyIndex, setStrategyIndex] = useState(0);
    const [extra, setExtra] = useState<TExtra>(initialExtra);
    const [result, setResult] = useState<unknown>(null);
    const [runContext, setRunContext] = useState({ initialBalance: DEFAULT_BALANCE, rounds: defaultRounds, baseBet: defaultBaseBet });
    const [loading, setLoading] = useState(false);

    const resolvedRounds = rounds === '' ? defaultRounds : rounds;
    const resolvedBaseBet = baseBet === '' ? defaultBaseBet : baseBet;
    const resolvedBalance = initialBalance === '' ? DEFAULT_BALANCE : initialBalance;

    const handleRun = useCallback(async () => {
        setLoading(true);
        await waitForNextFrame();
        const config = resolveBatchTestConfig(testMethod, resolvedRounds, resolvedBaseBet, resolvedBalance);
        const res = await onRun({
            rounds: config.rounds,
            baseBet: config.baseBet,
            initialBalance: config.initialBalance,
            strategyIndex,
            extra,
        });
        setRunContext(config);
        setResult(res);
        setLoading(false);
    }, [testMethod, resolvedRounds, resolvedBaseBet, resolvedBalance, strategyIndex, extra, onRun]);

    const resultTotalRounds = (result as { totalRounds?: number; rounds?: number } | null)
        ?.totalRounds ?? (result as { rounds?: number } | null)?.rounds ?? runContext.rounds;
    const balanceHistory = (result as { balanceHistory?: number[] } | null)?.balanceHistory;

    const strategySelect = (
        <div className={styles.field}>
            <label>下注策略:</label>
            <select value={strategyIndex} onChange={e => setStrategyIndex(Number(e.target.value))}>
                {strategyOptions.map((s, idx) =>
                    renderStrategyOption
                        ? renderStrategyOption(s, idx)
                        : <option key={idx} value={idx}>{s.name}</option>
                )}
            </select>
        </div>
    );

    return (
        <div className={styles.container}>
            <h2>{title}</h2>

            <div className={styles.config}>
                <div className={styles.field}>
                    <label>测试方法:</label>
                    <select value={testMethod} onChange={e => setTestMethod(e.target.value)}>
                        {BATCH_TEST_METHODS.map(method => (
                            <option key={method.id} value={method.id}>{method.label}</option>
                        ))}
                    </select>
                </div>

                {strategyPosition === 'top' && strategySelect}

                <div className={styles.field}>
                    <label>模拟局数:</label>
                    <input
                        type="number"
                        value={rounds}
                        onChange={e => setRounds(e.target.value === '' ? '' : Number(e.target.value))}
                        min="10"
                        max="100000"
                    />
                </div>

                <div className={styles.field}>
                    <label>初始注码:</label>
                    <input
                        type="number"
                        value={baseBet}
                        onChange={e => setBaseBet(e.target.value === '' ? '' : Number(e.target.value))}
                        min="1"
                        max="10000"
                    />
                </div>

                <div className={styles.field}>
                    <label>初始本金:</label>
                    <input
                        type="number"
                        value={initialBalance}
                        onChange={e => setInitialBalance(e.target.value === '' ? '' : Number(e.target.value))}
                        min="100"
                        max="1000000"
                    />
                </div>

                {renderExtraControls?.({ extra, setExtra })}

                {strategyPosition === 'bottom' && strategySelect}

                <button className={styles.runBtn} onClick={handleRun} disabled={loading}>
                    {loading ? '运行中...' : '开始模拟'}
                </button>
            </div>
            <p className={styles.methodHint}>{getBatchTestMethod(testMethod).description}</p>
            <p className={styles.methodHint}>{MAIN_THREAD_SIMULATION_WARNING}</p>

            {result !== null && (
                <div className={styles.results}>
                    <h3>测试结果 ({resultTotalRounds} / {runContext.rounds} 局)</h3>

                    <div className={styles.statsGrid}>
                        {renderStats(result, runContext)}
                    </div>

                    {balanceHistory && (
                        <AssetCurve data={balanceHistory} startBalance={runContext.initialBalance} />
                    )}
                </div>
            )}
        </div>
    );
}
