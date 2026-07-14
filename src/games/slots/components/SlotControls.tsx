import React from 'react';
import { SlotPhase } from '../types';
import type { SlotPhase as SlotPhaseType } from '../types';
import { confirmResetBalance } from '../../../utils/confirmResetBalance';
import styles from './SlotControls.module.css';

interface SlotControlsProps {
    phase: SlotPhaseType;
    balance: number;
    betPerLine: number;
    activeLines: number;
    totalBet: number;
    lastWin: number;
    onSetBetPerLine: (amount: number) => void;
    onSetActiveLines: (lines: number) => void;
    onSpin: () => void;
    onReset: () => void;
    onResetBalance?: () => void;
    autoSpinCount: number;
    isAutoSpinning: boolean;
    onAutoSpin: (count: number) => void;
    onStopAutoSpin: () => void;
}

const BET_PRESETS = [1, 5, 10, 25, 50, 100];
const LINE_PRESETS = [1, 5, 10, 15, 20];
const AUTO_SPIN_OPTIONS = [10, 50, 100, -1]; // -1 = 无限

export const SlotControls: React.FC<SlotControlsProps> = ({
    phase,
    balance,
    betPerLine,
    activeLines,
    totalBet,
    lastWin,
    onSetBetPerLine,
    onSetActiveLines,
    onSpin,
    onReset,
    onResetBalance,
    autoSpinCount,
    isAutoSpinning,
    onAutoSpin,
    onStopAutoSpin,
}) => {
    const [customBet, setCustomBet] = React.useState('');
    const [showAutoMenu, setShowAutoMenu] = React.useState(false);

    const handleCustomBetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val === '') {
            setCustomBet('');
            return;
        }
        if (/^\d*$/.test(val)) {
            setCustomBet(val);
            const num = parseInt(val, 10);
            if (!isNaN(num) && num > 0) {
                onSetBetPerLine(num);
            }
        }
    };

    const isBetting = phase === SlotPhase.Betting;
    const isSpinning = phase === SlotPhase.Spinning;
    const canSpin = isBetting && totalBet <= balance && totalBet > 0;
    const canResetBalance = phase === SlotPhase.Betting || phase === SlotPhase.Result;
    const handleResetBalanceClick = () => {
        if (!onResetBalance || !canResetBalance) return;
        if (!confirmResetBalance({ pendingStake: totalBet, inProgress: isAutoSpinning || isSpinning })) return;
        onResetBalance();
    };

    return (
        <div className={styles.controlsPanel}>
            {/* 信息条 */}
            <div className={styles.infoBar}>
                <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>余额</span>
                    <span className={styles.infoValue}>
                        ${balance.toLocaleString()}
                        {onResetBalance && (
                            <button
                                className={styles.resetBalanceBtn}
                                onClick={handleResetBalanceClick}
                                title={canResetBalance ? '重置余额并清空当前局' : '请等待旋转结束'}
                                aria-label="重置余额并清空当前局"
                                disabled={!canResetBalance}
                            >
                                ↺
                            </button>
                        )}
                    </span>
                </div>
                <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>总注额</span>
                    <span className={styles.infoValue}>${totalBet.toLocaleString()}</span>
                </div>
                {lastWin > 0 && (
                    <div className={`${styles.infoItem} ${styles.infoWin}`}>
                        <span className={styles.infoLabel}>赢</span>
                        <span className={styles.infoValueWin}>${lastWin.toLocaleString()}</span>
                    </div>
                )}
            </div>

            {/* 下注控制区 */}
            {isBetting && (
                <div className={styles.betControls}>
                    <div className={styles.betRow}>
                        <span className={styles.rowLabel}>每线下注</span>
                        <div className={styles.chipGroup}>
                            {BET_PRESETS.map(amt => (
                                <button
                                    key={amt}
                                    className={`${styles.chip} ${betPerLine === amt ? styles.chipActive : ''}`}
                                    onClick={() => { onSetBetPerLine(amt); setCustomBet(''); }}
                                >
                                    {amt}
                                </button>
                            ))}
                            <div className={styles.customInput}>
                                <label className="visually-hidden" htmlFor="slots-custom-bet-per-line">
                                    自定义每线注额
                                </label>
                                <span className={styles.dollarSign}>$</span>
                                <input
                                    id="slots-custom-bet-per-line"
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="自定义"
                                    value={customBet}
                                    onChange={handleCustomBetChange}
                                    className={!BET_PRESETS.includes(betPerLine) && betPerLine > 0 ? styles.inputActive : ''}
                                />
                            </div>
                        </div>
                    </div>

                    <div className={styles.betRow}>
                        <span className={styles.rowLabel}>赔付线</span>
                        <div className={styles.chipGroup}>
                            {LINE_PRESETS.map(lines => (
                                <button
                                    key={lines}
                                    className={`${styles.chip} ${activeLines === lines ? styles.chipActive : ''}`}
                                    onClick={() => onSetActiveLines(lines)}
                                >
                                    {lines}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* 操作按钮区 */}
            <div className={styles.actionBar}>
                {isAutoSpinning ? (
                    <button className={styles.stopAutoBtn} onClick={onStopAutoSpin}>
                        ⏹ 停止自动 {autoSpinCount > 0 && `(剩${autoSpinCount})`}
                    </button>
                ) : (
                    <>
                        {isBetting && (
                            <div className={styles.autoSpinWrapper}>
                                <button
                                    className={styles.autoBtn}
                                    onClick={() => setShowAutoMenu(v => !v)}
                                    disabled={!canSpin}
                                >
                                    🔄 自动
                                </button>
                                {showAutoMenu && (
                                    <div className={styles.autoMenu}>
                                        {AUTO_SPIN_OPTIONS.map(count => (
                                            <button
                                                key={count}
                                                className={styles.autoMenuItem}
                                                onClick={() => {
                                                    onAutoSpin(count);
                                                    setShowAutoMenu(false);
                                                }}
                                            >
                                                {count === -1 ? '∞ 无限' : `${count} 次`}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <button
                            className={`${styles.spinBtn} ${isSpinning ? styles.spinBtnActive : ''}`}
                            onClick={onSpin}
                            disabled={!canSpin && !isSpinning}
                        >
                            {isSpinning ? (
                                <span className={styles.spinningIcon}>⟳</span>
                            ) : (
                                <>🎰 旋转 (${totalBet})</>
                            )}
                        </button>

                        {isBetting && (
                            <button className={styles.resetBtn} onClick={onReset}>
                                重置当前局
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
