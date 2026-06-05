// ===== 骰宝游戏状态 Hook =====

import { useState, useCallback, useRef, useEffect } from 'react';
import { usePersistedBalance } from '../../../hooks/usePersistedBalance';
import { SicBoPhase } from '../types';
import type { SicBoGameState, SicBoBetType, DiceResult } from '../types';
import { rollDice, calculatePayout } from '../logic/SicBoEngine';
import { SICBO_ROLL_MS } from '../../../utils/motion';

const INITIAL_BALANCE = 10000;
const ROLL_DURATION_MS = SICBO_ROLL_MS;

export const useSicBoGame = () => {
    const { balance, debitBalance, creditBalance, resetBalance } = usePersistedBalance('sicbo', INITIAL_BALANCE);
    const [diceResult, setDiceResult] = useState<DiceResult | null>(null);
    const [gameState, setGameState] = useState<SicBoGameState>({
        phase: SicBoPhase.Betting,
        bets: [],
        dice: null,
        history: [],
        message: '请选择下注区域',
    });
    const rollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearRollTimer = useCallback(() => {
        if (rollTimerRef.current) {
            clearTimeout(rollTimerRef.current);
            rollTimerRef.current = null;
        }
    }, []);

    const placeBet = (type: SicBoBetType, amount: number, value?: number) => {
        if (gameState.phase !== SicBoPhase.Betting) return;
        if (!debitBalance(amount)) return;

        setGameState(prev => ({
            ...prev,
            bets: [...prev.bets, { type, amount, value }],
        }));
    };

    const clearBets = () => {
        if (gameState.phase !== SicBoPhase.Betting) return;
        const totalBet = gameState.bets.reduce((sum, b) => sum + b.amount, 0);
        creditBalance(totalBet);
        setGameState(prev => ({
            ...prev,
            bets: [],
        }));
    };

    const roll = useCallback(() => {
        if (gameState.phase !== SicBoPhase.Betting || gameState.bets.length === 0) return;

        // 生成骰子结果
        const dice = rollDice();
        // 快照当前下注，避免闭包过期
        const currentBets = [...gameState.bets];

        setDiceResult(dice);

        setGameState(prev => ({
            ...prev,
            phase: SicBoPhase.Rolling,
            message: '骰子正在摇动...',
        }));

        // 等待动画完成后计算赔付
        clearRollTimer();
        rollTimerRef.current = setTimeout(() => {
            rollTimerRef.current = null;
            let totalWin = 0;
            currentBets.forEach(bet => {
                totalWin += calculatePayout(bet, dice);
            });

            creditBalance(totalWin);

            const sum = dice[0] + dice[1] + dice[2];
            setGameState(prev => ({
                ...prev,
                phase: SicBoPhase.Result,
                dice,
                history: [dice, ...prev.history].slice(0, 20),
                message: `骰子: ${dice.join(', ')} | 总和: ${sum} | ${totalWin > 0 ? `赢得: $${totalWin}` : '未中奖'}`,
            }));
        }, ROLL_DURATION_MS);
    }, [clearRollTimer, creditBalance, gameState.bets, gameState.phase]);

    const resetGame = () => {
        clearRollTimer();
        setDiceResult(null);
        setGameState(prev => ({
            ...prev,
            phase: SicBoPhase.Betting,
            bets: [],
            dice: null,
            message: '请选择下注区域',
        }));
    };

    const handleResetBalance = () => {
        clearRollTimer();
        resetBalance();
        setDiceResult(null);
        setGameState(prev => ({
            ...prev,
            phase: SicBoPhase.Betting,
            bets: [],
            dice: null,
            message: '请选择下注区域',
        }));
    };

    useEffect(() => clearRollTimer, [clearRollTimer]);

    return {
        gameState,
        balance,
        diceResult,
        placeBet,
        clearBets,
        roll,
        resetGame,
        resetBalance: handleResetBalance,
    };
};
