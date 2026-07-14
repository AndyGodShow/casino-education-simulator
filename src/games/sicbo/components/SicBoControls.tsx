// ===== 骰宝控制面板 =====

import React, { useState } from 'react';
import type { SicBoPhase, DiceResult } from '../types';
import { confirmResetBalance } from '../../../utils/confirmResetBalance';
import styles from './SicBoControls.module.css';

interface SicBoControlsProps {
    phase: SicBoPhase;
    balance: number;
    totalBet: number;
    history: DiceResult[];
    selectedChip: number;
    onSelectChip: (chip: number) => void;
    onRoll: () => void;
    onClear: () => void;
    onReset: () => void;
    onResetBalance: () => void;
}

const PRESET_CHIPS = [10, 50, 100, 500, 1000];

export const SicBoControls: React.FC<SicBoControlsProps> = ({
    phase,
    balance,
    totalBet,
    history,
    selectedChip,
    onSelectChip,
    onRoll,
    onClear,
    onReset,
    onResetBalance,
}) => {
    const [customChip, setCustomChip] = useState('');
    const isBetting = phase === 'BETTING';
    const isResult = phase === 'RESULT';
    const canResetBalance = isBetting || isResult;
    const handleResetBalanceClick = () => {
        if (!canResetBalance) return;
        if (!confirmResetBalance({ pendingStake: totalBet })) return;
        onResetBalance();
    };

    const handleCustomChip = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setCustomChip(val);
        const num = parseInt(val, 10);
        if (num > 0) onSelectChip(num);
    };

    return (
        <div className={styles.controlsContainer}>
            {/* 余额和下注信息 */}
            <div className={styles.statsRow}>
                <span className={styles.stat}>
                    余额: <span>${balance.toLocaleString()}</span>
                    <button
                        className={styles.resetBalanceBtn}
                        onClick={handleResetBalanceClick}
                        title={canResetBalance ? '重置余额并清空当前局' : '请等待摇骰结束'}
                        aria-label="重置余额并清空当前局"
                        disabled={!canResetBalance}
                    >
                        ↺
                    </button>
                </span>
                <span className={styles.stat}>
                    当前下注: <span>${totalBet.toLocaleString()}</span>
                </span>
                {history.length > 0 && (
                    <div className={styles.history}>
                        历史:
                        {history.slice(0, 8).map((dice, i) => {
                            const sum = dice[0] + dice[1] + dice[2];
                            return (
                                <span
                                    key={i}
                                    className={`${styles.histNum} ${sum >= 11 ? styles.histBig : styles.histSmall}`}
                                    title={`${dice.join(',')} = ${sum}`}
                                >
                                    {sum}
                                </span>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 筹码选择 + 操作按钮 */}
            <div className={styles.actionRow}>
                <div className={styles.chipsRow}>
                    <div className={styles.presetChips}>
                        {PRESET_CHIPS.map(chip => (
                            <button
                                key={chip}
                                className={`${styles.chip} ${selectedChip === chip && customChip === '' ? styles.selectedChip : ''}`}
                                onClick={() => { onSelectChip(chip); setCustomChip(''); }}
                            >
                                {chip >= 1000 ? `${chip / 1000}k` : chip}
                            </button>
                        ))}
                    </div>
                    <div className={styles.customChipInputWrapper}>
                        <label className="visually-hidden" htmlFor="sic-bo-custom-bet">自定义下注金额</label>
                        <span className={styles.currencySymbol}>$</span>
                        <input
                            id="sic-bo-custom-bet"
                            type="number"
                            className={`${styles.chipInput} ${customChip ? styles.activeInput : ''}`}
                            placeholder="自定义"
                            value={customChip}
                            onChange={handleCustomChip}
                            min={1}
                        />
                    </div>
                </div>

                <div className={styles.mainButtons}>
                    {isBetting && (
                        <>
                            <button
                                className={styles.rollBtn}
                                onClick={onRoll}
                                disabled={totalBet === 0}
                            >
                                🎲 掷骰
                            </button>
                            <button className={styles.clearBtn} onClick={onClear}>
                                清除
                            </button>
                        </>
                    )}
                    {isResult && (
                        <button className={styles.resetBtn} onClick={onReset}>
                            新一轮
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
