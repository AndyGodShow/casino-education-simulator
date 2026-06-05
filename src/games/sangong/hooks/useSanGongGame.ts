// ===== 三公游戏 Hook =====

import { useState, useCallback, useEffect, useRef } from 'react';
import { usePersistedBalance } from '../../../hooks/usePersistedBalance';
import { SanGongPhase } from '../types';
import type { SanGongGameState, SanGongBetType } from '../types';
import { createDeck, evaluateHand, compareHands, calculatePayout, getResultName } from '../logic/SanGongEngine';
import { REVEAL_ROUND_MS } from '../../../utils/motion';

const INITIAL_BALANCE = 10000;
const DEAL_DURATION_MS = REVEAL_ROUND_MS;

export const useSanGongGame = () => {
    const { balance, debitBalance, creditBalance, resetBalance } = usePersistedBalance('sangong', INITIAL_BALANCE);
    const [gameState, setGameState] = useState<SanGongGameState>({
        phase: SanGongPhase.Betting,
        bets: [],
        playerHand: null,
        bankerHand: null,
        result: null,
        history: [],
        message: '请选择下注：闲赢、庄赢 或 和局',
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

    const placeBet = (type: SanGongBetType, amount: number) => {
        if (gameState.phase !== SanGongPhase.Betting) return;
        if (!debitBalance(amount)) return;
        setGameState(prev => ({ ...prev, bets: [...prev.bets, { type, amount }] }));
    };

    const clearBets = () => {
        if (gameState.phase !== SanGongPhase.Betting) return;
        const total = gameState.bets.reduce((s, b) => s + b.amount, 0);
        creditBalance(total);
        setGameState(prev => ({ ...prev, bets: [] }));
    };

    const deal = useCallback(async () => {
        if (gameState.phase !== SanGongPhase.Betting || gameState.bets.length === 0) return;

        const dealToken = dealTokenRef.current;
        const currentBets = [...gameState.bets];
        const deck = createDeck();
        const playerHand = evaluateHand([deck[0], deck[1], deck[2]]);
        const bankerHand = evaluateHand([deck[3], deck[4], deck[5]]);

        setGameState(prev => ({ ...prev, phase: SanGongPhase.Dealing, playerHand, bankerHand: null, message: '发牌中...' }));

        const shouldContinue = await waitForReveal(dealToken);
        if (!shouldContinue) return;

        const cmp = compareHands(playerHand, bankerHand);
        const result: 'player_wins' | 'banker_wins' | 'tie' = cmp > 0 ? 'player_wins' : cmp < 0 ? 'banker_wins' : 'tie';

        let totalWin = 0;
        currentBets.forEach(bet => { totalWin += calculatePayout(bet, result); });

        creditBalance(totalWin);
        setGameState(prev => ({
            ...prev,
            phase: SanGongPhase.Result, bankerHand, result,
            history: [result, ...prev.history].slice(0, 20),
            message: `${getResultName(result)}！闲：${playerHand.handName} vs 庄：${bankerHand.handName}${totalWin > 0 ? ` | 赢得: $${totalWin}` : ' | 未中奖'}`,
        }));
    }, [creditBalance, gameState.bets, gameState.phase, waitForReveal]);

    const resetGame = () => {
        clearPendingDeal();
        setGameState(prev => ({
            ...prev, phase: SanGongPhase.Betting, bets: [],
            playerHand: null, bankerHand: null, result: null,
            message: '请选择下注：闲赢、庄赢 或 和局',
        }));
    };

    const handleResetBalance = () => {
        clearPendingDeal();
        resetBalance();
        setGameState(prev => ({
            ...prev,
            phase: SanGongPhase.Betting,
            bets: [],
            playerHand: null,
            bankerHand: null,
            result: null,
            message: '请选择下注：闲赢、庄赢 或 和局',
        }));
    };

    useEffect(() => clearPendingDeal, [clearPendingDeal]);

    return { gameState, balance, placeBet, clearBets, deal, resetGame, resetBalance: handleResetBalance };
};
