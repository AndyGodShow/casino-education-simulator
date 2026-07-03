import { useState, useRef, useCallback, useEffect } from 'react';
import { usePersistedBalance } from '../../../hooks/usePersistedBalance';
import { Card } from '../../../logic/Card';
import { Deck } from '../../../logic/Deck';
import {
    calculateScore,
    isBlackjack,
    isBust,
    shouldDealerHit,
} from '../logic/BlackjackRules';
import { BlackjackPhase } from '../types';
import type { BlackjackGameState } from '../types';
import { DEAL_STEP_MS } from '../../../utils/motion';

const INITIAL_BALANCE = 10000;
const DEAL_DELAY_MS = DEAL_STEP_MS;

const createEmptyHand = () => ({
    cards: [],
    score: 0,
    bet: 0,
    isBust: false,
    isStay: false,
    status: 'active' as const,
});

export const useBlackjackGame = () => {
    const deckRef = useRef<Deck>(new Deck(6));
    const { balance, debitBalance, creditBalance, resetBalance } = usePersistedBalance('blackjack', INITIAL_BALANCE);
    const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    const actionTokenRef = useRef(0);
    const [gameState, setGameState] = useState<BlackjackGameState>({
        phase: BlackjackPhase.Betting,
        playerHands: [createEmptyHand()],
        currentHandIndex: 0,
        dealerHand: createEmptyHand(),
        deckRemaining: 312, // Initial 6-deck count
        message: '请下注开始游戏',
        history: [],
    });

    const schedule = useCallback((callback: () => void, delay: number) => {
        const timer = setTimeout(() => {
            timersRef.current = timersRef.current.filter(entry => entry !== timer);
            callback();
        }, delay);
        timersRef.current.push(timer);
    }, []);

    const clearPendingActions = useCallback(() => {
        actionTokenRef.current += 1;
        timersRef.current.forEach(clearTimeout);
        timersRef.current = [];
    }, []);

    const drawCard = useCallback((): Card => {
        let card = deckRef.current.draw();
        if (!card) {
            deckRef.current.reset();
            card = deckRef.current.draw()!;
        }
        return card;
    }, []);

    const placeBet = (amount: number) => {
        if (gameState.phase !== BlackjackPhase.Betting) return;
        if (!debitBalance(amount)) return;

        setGameState(prev => ({
            ...prev,
            playerHands: [{ ...prev.playerHands[0], bet: prev.playerHands[0].bet + amount }],
            message: '准备发牌...',
        }));
    };

    const deal = () => {
        const bet = gameState.playerHands[0].bet;
        if (bet === 0) return;
        const dealToken = actionTokenRef.current;

        const p1 = drawCard();
        const d1 = drawCard();
        const p2 = drawCard();
        const d2 = drawCard();

        setGameState(prev => ({
            ...prev,
            phase: BlackjackPhase.PlayerTurn,
            message: '正在发牌...',
        }));

        schedule(() => {
            if (dealToken !== actionTokenRef.current) return;
            const initialPlayerCards = [p1, p2];
            const initialDealerCards = [d1, d2];
            const pScore = calculateScore(initialPlayerCards).score;
            const dScore = calculateScore(initialDealerCards).score;

            const playerIsBJ = isBlackjack(initialPlayerCards);
            const dealerIsBJ = isBlackjack(initialDealerCards);

            setGameState(prev => ({
                ...prev,
                playerHands: [{
                    ...prev.playerHands[0],
                    cards: initialPlayerCards,
                    score: pScore,
                    status: playerIsBJ ? 'blackjack' : 'active'
                }],
                dealerHand: {
                    ...prev.dealerHand,
                    cards: initialDealerCards,
                    score: dScore,
                    status: dealerIsBJ ? 'blackjack' : 'active'
                },
                message: playerIsBJ ? '恭喜！Blackjack！' : '您的回合',
                deckRemaining: deckRef.current.remaining
            }));

            if (playerIsBJ || dealerIsBJ) {
                finalizeRound(playerIsBJ, dealerIsBJ, pScore, dScore);
            }
        }, DEAL_DELAY_MS);
    };

    const hit = () => {
        if (gameState.phase !== BlackjackPhase.PlayerTurn) return;
        const hitToken = actionTokenRef.current;

        const card = drawCard();

        setGameState(prev => {
            const currentHand = { ...prev.playerHands[prev.currentHandIndex] };
            const newCards = [...currentHand.cards, card];
            const newScore = calculateScore(newCards).score;
            const bust = isBust(newCards);

            const updatedHand = {
                ...currentHand,
                cards: newCards,
                score: newScore,
                status: bust ? 'bust' as const : currentHand.status,
                isBust: bust,
            };

            const newHands = [...prev.playerHands];
            newHands[prev.currentHandIndex] = updatedHand;

            if (bust) {
                // Schedule finalizeRound outside setState
                schedule(() => {
                    if (hitToken !== actionTokenRef.current) return;
                    finalizeRound(false, false, newScore, prev.dealerHand.score);
                }, 0);
            }

            return {
                ...prev,
                playerHands: newHands,
                message: bust ? '爆牌了！' : `当前点数: ${newScore}`,
                deckRemaining: deckRef.current.remaining,
            };
        });
    };

    const stand = () => {
        if (gameState.phase !== BlackjackPhase.PlayerTurn) return;
        const standToken = actionTokenRef.current;

        // Snapshot player score BEFORE async dealer turn
        const playerScore = gameState.playerHands[0].score;
        const dealerCardsArray = [...gameState.dealerHand.cards];

        setGameState(prev => ({
            ...prev,
            phase: BlackjackPhase.DealerTurn,
            message: '庄家回合...',
        }));

        // Dealer draws sequentially with setTimeout chain
        const processDealerStep = () => {
            if (standToken !== actionTokenRef.current) return;
            if (shouldDealerHit(dealerCardsArray)) {
                const newCard = drawCard();
                dealerCardsArray.push(newCard);
                const currentScore = calculateScore(dealerCardsArray).score;
                setGameState(prev => ({
                    ...prev,
                    dealerHand: { ...prev.dealerHand, cards: [...dealerCardsArray], score: currentScore },
                    deckRemaining: deckRef.current.remaining
                }));
                schedule(processDealerStep, DEAL_DELAY_MS);
            } else {
                const finalScore = calculateScore(dealerCardsArray).score;
                finalizeRound(false, false, playerScore, finalScore, [...dealerCardsArray]);
            }
        };

        schedule(processDealerStep, DEAL_DELAY_MS);
    };

    const finalizeRound = (pBJ: boolean, dBJ: boolean, pScore: number, dScore: number, finalDealerCards?: Card[]) => {
        let payout = 0;
        let resultMessage = '';
        const bet = gameState.playerHands[0].bet;

        if (pBJ && dBJ) {
            payout = bet;
            resultMessage = '平局 (双方 Blackjack)';
        } else if (pBJ) {
            payout = bet * 2.5; // 3:2 payout
            resultMessage = 'Blackjack！玩家获胜';
        } else if (dBJ) {
            payout = 0;
            resultMessage = '庄家 Blackjack，玩家输';
        } else if (pScore > 21) {
            payout = 0;
            resultMessage = '玩家爆牌';
        } else if (dScore > 21) {
            payout = bet * 2;
            resultMessage = '庄家爆牌，玩家获胜';
        } else if (pScore > dScore) {
            payout = bet * 2;
            resultMessage = '玩家领先获胜';
        } else if (pScore < dScore) {
            payout = 0;
            resultMessage = '庄家获胜';
        } else {
            payout = bet;
            resultMessage = '平局 (Push)';
        }

        creditBalance(payout);
        setGameState(prev => ({
            ...prev,
            phase: BlackjackPhase.Result,
            message: resultMessage,
            dealerHand: finalDealerCards ? { ...prev.dealerHand, cards: finalDealerCards, score: dScore } : prev.dealerHand
        }));

        // Check for reshuffle for next round
        if (deckRef.current.shouldReshuffle()) {
            deckRef.current.reset();
            setGameState(prev => ({ ...prev, message: prev.message + ' (洗牌中...)' }));
        }
    };

    const resetGame = () => {
        clearPendingActions();
        setGameState(prev => ({
            ...prev,
            phase: BlackjackPhase.Betting,
            playerHands: [createEmptyHand()],
            currentHandIndex: 0,
            dealerHand: createEmptyHand(),
            deckRemaining: deckRef.current.remaining,
            message: '请下注开始游戏',
        }));
    };

    const handleResetBalance = () => {
        clearPendingActions();
        resetBalance();
        setGameState(prev => ({
            ...prev,
            phase: BlackjackPhase.Betting,
            playerHands: [createEmptyHand()],
            currentHandIndex: 0,
            dealerHand: createEmptyHand(),
            deckRemaining: deckRef.current.remaining,
            message: '请下注开始游戏',
        }));
    };

    useEffect(() => clearPendingActions, [clearPendingActions]);

    return {
        gameState,
        balance,
        placeBet,
        deal,
        hit,
        stand,
        resetGame,
        resetBalance: handleResetBalance,
    };
};
