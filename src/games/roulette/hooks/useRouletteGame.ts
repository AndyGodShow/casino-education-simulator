import { useState, useCallback, useRef, useEffect } from 'react';
import { usePersistedBalance } from '../../../hooks/usePersistedBalance';
import { RoulettePhase } from '../types';
import type { RouletteGameState, RouletteBetType } from '../types';
import { calculateRoulettePayout } from '../logic/RouletteEngine';
import { getSecureRandomInt } from '../../../logic/Random';
import { ROULETTE_SPIN_MS } from '../../../utils/motion';

const INITIAL_BALANCE = 10000;
const SPIN_DURATION_MS = ROULETTE_SPIN_MS;

export const useRouletteGame = () => {
    const { balance, debitBalance, creditBalance, resetBalance } = usePersistedBalance('roulette', INITIAL_BALANCE);
    const [spinResult, setSpinResult] = useState<number | null>(null);
    const [gameState, setGameState] = useState<RouletteGameState>({
        phase: RoulettePhase.Betting,
        bets: [],
        lastNumber: null,
        history: [],
        message: '请选择下注区域',
    });
    const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearSpinTimer = useCallback(() => {
        if (spinTimerRef.current) {
            clearTimeout(spinTimerRef.current);
            spinTimerRef.current = null;
        }
    }, []);

    const placeBet = (type: RouletteBetType, amount: number, value?: number) => {
        if (gameState.phase !== RoulettePhase.Betting) return;
        if (!debitBalance(amount)) return;

        setGameState(prev => ({
            ...prev,
            bets: [...prev.bets, { type, amount, value }],
        }));
    };

    const clearBets = () => {
        if (gameState.phase !== RoulettePhase.Betting) return;
        const totalBet = gameState.bets.reduce((sum, b) => sum + b.amount, 0);
        creditBalance(totalBet);
        setGameState(prev => ({
            ...prev,
            bets: [],
        }));
    };

    const spin = useCallback(() => {
        if (gameState.phase !== RoulettePhase.Betting || gameState.bets.length === 0) return;

        // Generate result BEFORE animation starts so wheel knows where to land
        const resultNum = getSecureRandomInt(37);
        // Capture current bets before transitioning to spinning phase
        const currentBets = [...gameState.bets];

        setSpinResult(resultNum);

        setGameState(prev => ({
            ...prev,
            phase: RoulettePhase.Spinning,
            message: '轮盘正在旋转...',
        }));

        // Wait for wheel animation to finish, then calculate payouts
        clearSpinTimer();
        spinTimerRef.current = setTimeout(() => {
            spinTimerRef.current = null;
            let totalWin = 0;
            currentBets.forEach(bet => {
                totalWin += calculateRoulettePayout(bet, resultNum);
            });

            creditBalance(totalWin);
            setGameState(prev => ({
                ...prev,
                phase: RoulettePhase.Result,
                lastNumber: resultNum,
                history: [resultNum, ...prev.history].slice(0, 10),
                message: `结果是 ${resultNum}。赢得: $${totalWin}`,
            }));
        }, SPIN_DURATION_MS);
    }, [clearSpinTimer, creditBalance, gameState.bets, gameState.phase]);

    const resetGame = () => {
        clearSpinTimer();
        setSpinResult(null);
        setGameState(prev => ({
            ...prev,
            phase: RoulettePhase.Betting,
            bets: [],
            message: '请选择下注区域',
        }));
    };

    const handleResetBalance = () => {
        clearSpinTimer();
        resetBalance();
        setSpinResult(null);
        setGameState(prev => ({
            ...prev,
            phase: RoulettePhase.Betting,
            bets: [],
            lastNumber: null,
            message: '请选择下注区域',
        }));
    };

    useEffect(() => clearSpinTimer, [clearSpinTimer]);

    return {
        gameState,
        balance,
        spinResult,
        placeBet,
        clearBets,
        spin,
        resetGame,
        resetBalance: handleResetBalance,
    };
};
