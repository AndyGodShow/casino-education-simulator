import React, { useState } from 'react';
import { GamePhase } from '../../../../types';
import type { PlayerState } from '../../../../types';
import { confirmResetBalance } from '../../../../utils/confirmResetBalance';
import styles from './Controls.module.css';

interface ControlsProps {
    gamePhase: GamePhase;
    playerState: PlayerState;
    onPlaceBet: (type: 'PLAYER' | 'BANKER' | 'TIE' | 'PLAYER_PAIR' | 'BANKER_PAIR', amount: number) => void;
    onClearBet: () => void;
    onDeal: () => void;
    onReset: () => void;
    onResetBalance?: () => void;
}

export const Controls: React.FC<ControlsProps> = ({
    gamePhase,
    playerState,
    onPlaceBet,
    onClearBet,
    onDeal,
    onReset,
    onResetBalance,
}) => {
    const [betAmount, setBetAmount] = useState<number | string>(100);
    const isBetting = gamePhase === GamePhase.Betting;
    const canResetBalance = gamePhase === GamePhase.Betting || gamePhase === GamePhase.Result;
    const handleResetBalanceClick = () => {
        if (!onResetBalance || !canResetBalance) return;
        if (!confirmResetBalance({ pendingStake: playerState.currentBet })) return;
        onResetBalance();
    };

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // ... (existing logic)
        const val = e.target.value;
        if (val === '') {
            setBetAmount('');
            return;
        }
        if (/^\d*$/.test(val)) {
            const numVal = parseInt(val, 10);
            if (!isNaN(numVal)) {
                setBetAmount(numVal);
            }
        }
    };

    return (
        <div className={styles.controlsContainer}>
            <div className={styles.balanceInfo}>
                <div className={styles.infoParam}>
                    <span className={styles.label}>当前余额:</span>
                    <div className={styles.balanceWrapper}>
                        <span className={styles.value}>${playerState.balance.toLocaleString()}</span>
                        {onResetBalance && (
                            <button
                                className={styles.resetBalanceBtn}
                                onClick={handleResetBalanceClick}
                                title={canResetBalance ? '重置余额并清空当前局' : '请等待当前发牌完成'}
                                aria-label="重置余额并清空当前局"
                                disabled={!canResetBalance}
                            >
                                ↺
                            </button>
                        )}
                    </div>
                </div>
                <div className={styles.infoParam}>
                    <span className={styles.label}>当前下注:</span>
                    <span className={styles.value}>${playerState.currentBet.toLocaleString()}</span>
                </div>
            </div>

            {isBetting ? (
                <div className={styles.bettingControls}>
                    <div className={styles.chipSelector}>
                        {[10, 50, 100, 500, 1000].map((amt) => (
                            <button
                                key={amt}
                                className={`${styles.chip} ${betAmount === amt ? styles.selectedChip : ''}`}
                                onClick={() => setBetAmount(amt)}
                            >
                                {amt}
                            </button>
                        ))}
                        <div className={styles.customBetContainer}>
                            <label className="visually-hidden" htmlFor="baccarat-custom-bet">
                                自定义下注金额
                            </label>
                            <span className={styles.currencySymbol}>$</span>
                            <input
                                id="baccarat-custom-bet"
                                type="text"
                                inputMode="numeric"
                                className={styles.customInput}
                                value={betAmount}
                                onChange={handleAmountChange}
                                placeholder="自定义"
                                autoComplete="off"
                            />
                        </div>
                    </div>

                    <div className={styles.betActionsRow}>
                        {/* Player Pair */}
                        <button
                            className={`${styles.betBtn} ${styles.sideBetBtn} ${playerState.bets['PLAYER_PAIR'] ? styles.active : ''}`}
                            onClick={() => onPlaceBet('PLAYER_PAIR', Number(betAmount) || 0)}
                            disabled={!betAmount || playerState.balance < Number(betAmount)}
                        >
                            <div>闲对</div>
                            <div className={styles.odds}>11:1</div>
                            {playerState.bets['PLAYER_PAIR'] && <div className={styles.betChip}>{playerState.bets['PLAYER_PAIR']}</div>}
                        </button>

                        {/* Player */}
                        <button
                            className={`${styles.betBtn} ${styles.playerBtn} ${playerState.bets['PLAYER'] ? styles.active : ''}`}
                            onClick={() => onPlaceBet('PLAYER', Number(betAmount) || 0)}
                            disabled={!betAmount || playerState.balance < Number(betAmount)}
                        >
                            <div>闲 PLAYER</div>
                            <div className={styles.odds}>1:1</div>
                            {playerState.bets['PLAYER'] && <div className={styles.betChip}>{playerState.bets['PLAYER']}</div>}
                        </button>

                        {/* Tie */}
                        <button
                            className={`${styles.betBtn} ${styles.tieBtn} ${playerState.bets['TIE'] ? styles.active : ''}`}
                            onClick={() => onPlaceBet('TIE', Number(betAmount) || 0)}
                            disabled={!betAmount || playerState.balance < Number(betAmount)}
                        >
                            <div>和 TIE</div>
                            <div className={styles.odds}>8:1</div>
                            {playerState.bets['TIE'] && <div className={styles.betChip}>{playerState.bets['TIE']}</div>}
                        </button>

                        {/* Banker */}
                        <button
                            className={`${styles.betBtn} ${styles.bankerBtn} ${playerState.bets['BANKER'] ? styles.active : ''}`}
                            onClick={() => onPlaceBet('BANKER', Number(betAmount) || 0)}
                            disabled={!betAmount || playerState.balance < Number(betAmount)}
                        >
                            <div>庄 BANKER</div>
                            <div className={styles.odds}>0.95:1</div>
                            {playerState.bets['BANKER'] && <div className={styles.betChip}>{playerState.bets['BANKER']}</div>}
                        </button>

                        {/* Banker Pair */}
                        <button
                            className={`${styles.betBtn} ${styles.sideBetBtn} ${playerState.bets['BANKER_PAIR'] ? styles.active : ''}`}
                            onClick={() => onPlaceBet('BANKER_PAIR', Number(betAmount) || 0)}
                            disabled={!betAmount || playerState.balance < Number(betAmount)}
                        >
                            <div>庄对</div>
                            <div className={styles.odds}>11:1</div>
                            {playerState.bets['BANKER_PAIR'] && <div className={styles.betChip}>{playerState.bets['BANKER_PAIR']}</div>}
                        </button>
                    </div>

                    <div className={styles.actionRow}>
                        <button className={styles.actionBtn} onClick={onClearBet} disabled={playerState.currentBet === 0}>
                            清除
                        </button>
                        <button className={`${styles.actionBtn} ${styles.dealBtn}`} onClick={onDeal} disabled={playerState.currentBet === 0}>
                            发牌
                        </button>
                    </div>
                </div>
            ) : (
                <div className={styles.resultControls}>
                    {gamePhase === GamePhase.Result && (
                        <button className={`${styles.actionBtn} ${styles.dealBtn}`} onClick={onReset}>
                            新的一局
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
