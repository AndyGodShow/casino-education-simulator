import React from 'react';
import { BlackjackPhase } from '../types';
import { confirmResetBalance } from '../../../utils/confirmResetBalance';
import styles from './BlackjackControls.module.css';

interface BlackjackControlsProps {
    phase: BlackjackPhase;
    balance: number;
    currentBet: number;
    onPlaceBet: (amount: number) => void;
    onDeal: () => void;
    onHit: () => void;
    onStand: () => void;
    onReset: () => void;
    onResetBalance?: () => void;
}

export const BlackjackControls: React.FC<BlackjackControlsProps> = ({
    phase,
    balance,
    currentBet,
    onPlaceBet,
    onDeal,
    onHit,
    onStand,
    onReset,
    onResetBalance,
}) => {
    const [customAmount, setCustomAmount] = React.useState<number | string>(100);
    const canResetBalance = phase === BlackjackPhase.Betting || phase === BlackjackPhase.Result;
    const handleResetBalanceClick = () => {
        if (!onResetBalance || !canResetBalance) return;
        if (!confirmResetBalance({ pendingStake: currentBet })) return;
        onResetBalance();
    };

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val === '') {
            setCustomAmount('');
            return;
        }
        if (/^\d*$/.test(val)) {
            const numVal = parseInt(val, 10);
            if (!isNaN(numVal)) {
                setCustomAmount(numVal);
            }
        }
    };

    return (
        <div className={styles.controlsContainer}>
            <div className={styles.statsRow}>
                <div className={styles.stat}>
                    <span className={styles.statLabel}>当前余额 (BALANCE)</span>
                    <div className={styles.statValueWrapper}>
                        <span className={styles.statValue}>${balance.toLocaleString()}</span>
                        {onResetBalance && (
                            <button
                                className={styles.resetBalanceBtn}
                                onClick={handleResetBalanceClick}
                                title={canResetBalance ? '重置余额并清空当前局' : '请等待当前回合完成'}
                                aria-label="重置余额并清空当前局"
                                disabled={!canResetBalance}
                            >
                                ↺
                            </button>
                        )}
                    </div>
                </div>
                <div className={styles.stat}>
                    <span className={styles.statLabel}>合计下注 (TOTAL BET)</span>
                    <div className={styles.statValueWrapper}>
                        <span className={styles.statValue}>${currentBet.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            <div className={styles.actionRow}>
                {phase === BlackjackPhase.Betting && (
                    <div className={styles.chipsSection}>
                        <div className={styles.chips}>
                            {[10, 50, 100, 500, 1000].map(amt => (
                                <button
                                    key={amt}
                                    className={`${styles.chip} ${customAmount === amt ? styles.selectedChip : ''}`}
                                    onClick={() => setCustomAmount(amt)}
                                    disabled={balance < amt}
                                >
                                    {amt}
                                </button>
                            ))}
                        </div>
                        <div className={styles.customBetContainer}>
                            <label className="visually-hidden" htmlFor="blackjack-custom-bet">
                                自定义下注金额
                            </label>
                            <span className={styles.currencySymbol}>$</span>
                            <input
                                id="blackjack-custom-bet"
                                type="text"
                                inputMode="numeric"
                                className={styles.customInput}
                                value={customAmount}
                                onChange={handleAmountChange}
                                placeholder="CUSTOM"
                                autoComplete="off"
                            />
                            <button
                                className={styles.addBetBtn}
                                onClick={() => onPlaceBet(Number(customAmount) || 0)}
                                disabled={!customAmount || balance < Number(customAmount)}
                            >
                                确认下注
                            </button>
                        </div>
                        <button
                            className={`${styles.actionBtn} ${styles.dealBtn}`}
                            onClick={onDeal}
                            disabled={currentBet === 0}
                        >
                            发牌 (DEAL)
                        </button>
                    </div>
                )}

                {phase === BlackjackPhase.PlayerTurn && (
                    <div className={styles.playerActions}>
                        <button className={`${styles.actionBtn} ${styles.hitBtn}`} onClick={onHit}>
                            要牌 (HIT)
                        </button>
                        <button className={`${styles.actionBtn} ${styles.standBtn}`} onClick={onStand}>
                            停牌 (STAND)
                        </button>
                    </div>
                )}

                {phase === BlackjackPhase.Result && (
                    <button className={`${styles.actionBtn} ${styles.resetBtn}`} onClick={onReset}>
                        再来一局 (NEW GAME)
                    </button>
                )}
            </div>
        </div>
    );
};
