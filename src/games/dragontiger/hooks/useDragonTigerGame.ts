// ===== 龙虎斗游戏 Hook =====

import { useState, useCallback, useEffect, useRef } from 'react';
import { usePersistedBalance } from '../../../hooks/usePersistedBalance';
import { DragonTigerPhase } from '../types';
import type { DragonTigerGameState, DragonTigerBetType } from '../types';
import { createShuffledDeck, determineResult, calculatePayout, getResultName } from '../logic/DragonTigerEngine';
import { REVEAL_ROUND_MS } from '../../../utils/motion';

const INITIAL_BALANCE = 10000;
const DEAL_DURATION_MS = REVEAL_ROUND_MS;

export const useDragonTigerGame = () => {
    const { balance, debitBalance, creditBalance, resetBalance } = usePersistedBalance('dragontiger', INITIAL_BALANCE);
    const [gameState, setGameState] = useState<DragonTigerGameState>({
        phase: DragonTigerPhase.Betting,
        bets: [],
        dragonCard: null,
        tigerCard: null,
        result: null,
        history: [],
        message: '请选择下注：龙、虎 或 和',
    });
    const dealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dealTokenRef = useRef(0);

    const clearPendingDeal = useCallback(() => {
        dealTokenRef.current += 1;
        if (dealTimerRef.current) {
            clearTimeout(dealTimerRef.current);
            dealTimerRef.current = null;
        }
    }, []);

    const waitForReveal = useCallback((token: number) => (
        new Promise<boolean>((resolve) => {
            dealTimerRef.current = setTimeout(() => {
                dealTimerRef.current = null;
                resolve(token === dealTokenRef.current);
            }, DEAL_DURATION_MS);
        })
    ), []);

    const placeBet = (type: DragonTigerBetType, amount: number) => {
        if (gameState.phase !== DragonTigerPhase.Betting) return;
        if (!debitBalance(amount)) return;
        setGameState(prev => ({
            ...prev,
            bets: [...prev.bets, { type, amount }],
        }));
    };

    const clearBets = () => {
        if (gameState.phase !== DragonTigerPhase.Betting) return;
        const totalBet = gameState.bets.reduce((sum, b) => sum + b.amount, 0);
        creditBalance(totalBet);
        setGameState(prev => ({ ...prev, bets: [] }));
    };

    const deal = useCallback(async () => {
        if (gameState.phase !== DragonTigerPhase.Betting || gameState.bets.length === 0) return;

        const dealToken = dealTokenRef.current;
        const currentBets = [...gameState.bets];
        const deck = createShuffledDeck();
        const dragonCard = deck[0];
        const tigerCard = deck[1];

        setGameState(prev => ({
            ...prev,
            phase: DragonTigerPhase.Dealing,
            dragonCard,
            tigerCard: null,
            message: '发牌中...',
        }));

        const shouldContinue = await waitForReveal(dealToken);
        if (!shouldContinue) return;

        const result = determineResult(dragonCard, tigerCard);

        let totalWin = 0;
        currentBets.forEach(bet => {
            totalWin += calculatePayout(bet, result);
        });

        creditBalance(totalWin);
        setGameState(prev => ({
            ...prev,
            phase: DragonTigerPhase.Result,
            tigerCard,
            result,
            history: [result, ...prev.history].slice(0, 20),
            message: `${getResultName(result)}赢！${totalWin > 0 ? `赢得: $${totalWin}` : '未中奖'}`,
        }));
    }, [creditBalance, gameState.bets, gameState.phase, waitForReveal]);

    const resetGame = () => {
        clearPendingDeal();
        setGameState(prev => ({
            ...prev,
            phase: DragonTigerPhase.Betting,
            bets: [],
            dragonCard: null,
            tigerCard: null,
            result: null,
            message: '请选择下注：龙、虎 或 和',
        }));
    };

    const handleResetBalance = () => {
        clearPendingDeal();
        resetBalance();
        setGameState(prev => ({
            ...prev,
            phase: DragonTigerPhase.Betting,
            bets: [],
            dragonCard: null,
            tigerCard: null,
            result: null,
            message: '请选择下注：龙、虎 或 和',
        }));
    };

    useEffect(() => clearPendingDeal, [clearPendingDeal]);

    return { gameState, balance, placeBet, clearBets, deal, resetGame, resetBalance: handleResetBalance };
};
