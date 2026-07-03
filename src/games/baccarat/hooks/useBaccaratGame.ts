import { useState, useRef, useCallback, useEffect } from 'react';
import { usePersistedBalance } from '../../../hooks/usePersistedBalance';
import { Card } from '../../../logic/Card';
import { Deck } from '../../../logic/Deck';
import {
    calculateHandValue,
    isNatural,
    getPlayerThirdCardAction,
    getBankerThirdCardAction,
    determineWinner,
    GameResult,
} from '../logic/Rules';
import type { GameState, PlayerState, RoundResult, BetType } from '../../../types';
import { GamePhase } from '../../../types';
import { DEAL_STEP_MS } from '../../../utils/motion';

const INITIAL_BALANCE = 10000;
const DEAL_DELAY_MS = DEAL_STEP_MS;
const INITIAL_DECK_REMAINING = 8 * 52;

export const useBaccaratGame = () => {
    // Deck Management
    const deckRef = useRef<Deck>(new Deck(8));
    const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    const roundTokenRef = useRef(0);

    // Balance persisted to localStorage
    const {
        balance,
        debitBalance,
        creditBalance,
        resetBalance: resetPersistedBalance,
    } = usePersistedBalance('baccarat', INITIAL_BALANCE);
    const [deckRemaining, setDeckRemaining] = useState(INITIAL_DECK_REMAINING);

    // Player State (Bets)
    const [playerState, setPlayerState] = useState<PlayerState>({
        balance: 0, // unused — balance now managed by usePersistedBalance  
        currentBet: 0,
        bets: {},
    });

    // Game State
    const [gameState, setGameState] = useState<GameState>({
        phase: GamePhase.Betting,
        playerHand: [],
        bankerHand: [],
        playerScore: 0,
        bankerScore: 0,
        history: [],
        message: '请下注',
    });

    const scheduleWait = useCallback((token: number) => (
        new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => {
                timersRef.current = timersRef.current.filter(entry => entry !== timer);
                resolve(token === roundTokenRef.current);
            }, DEAL_DELAY_MS);
            timersRef.current.push(timer);
        })
    ), []);

    const clearPendingRound = useCallback(() => {
        roundTokenRef.current += 1;
        timersRef.current.forEach(clearTimeout);
        timersRef.current = [];
    }, []);

    // Helper to safely draw a card, reshuffling if needed
    const drawCard = useCallback((): Card => {
        let card = deckRef.current.draw();
        if (!card) {
            // This should ideally be caught by shouldReshuffle earlier
            deckRef.current.reset();
            card = deckRef.current.draw()!;
        }
        setDeckRemaining(deckRef.current.remaining);
        return card;
    }, []);

    const placeBet = (type: BetType, amount: number) => {
        if (gameState.phase !== GamePhase.Betting) return;
        if (!debitBalance(amount)) return;

        setPlayerState((prev) => {
            const currentTypeBet = prev.bets[type] || 0;
            return {
                ...prev,
                currentBet: prev.currentBet + amount,
                bets: {
                    ...prev.bets,
                    [type]: currentTypeBet + amount,
                },
            };
        });
    };

    const clearBet = () => {
        if (gameState.phase !== GamePhase.Betting) return;
        creditBalance(playerState.currentBet);
        setPlayerState(prev => ({
            ...prev,
            currentBet: 0,
            bets: {}
        }));
    }

    const startGame = async () => {
        if (playerState.currentBet === 0) return;
        const roundToken = roundTokenRef.current;
        const currentBets = { ...playerState.bets };

        // Balance already deducted in placeBet

        setGameState((prev) => ({
            ...prev,
            phase: GamePhase.Dealing,
            playerHand: [],
            bankerHand: [],
            playerScore: 0,
            bankerScore: 0,
            message: '发牌中...',
        }));

        // Initial Deal Sequence with Delays
        if (!(await scheduleWait(roundToken))) return;
        const p1 = drawCard();
        setGameState((prev) => ({ ...prev, playerHand: [p1], playerScore: calculateHandValue([p1]) }));

        if (!(await scheduleWait(roundToken))) return;
        const b1 = drawCard();
        setGameState((prev) => ({ ...prev, bankerHand: [b1], bankerScore: calculateHandValue([b1]) }));

        if (!(await scheduleWait(roundToken))) return;
        const p2 = drawCard();
        const pHandInitial = [p1, p2];
        setGameState((prev) => ({
            ...prev,
            playerHand: pHandInitial,
            playerScore: calculateHandValue(pHandInitial),
        }));

        if (!(await scheduleWait(roundToken))) return;
        const b2 = drawCard();
        const bHandInitial = [b1, b2];
        setGameState((prev) => ({
            ...prev,
            bankerHand: bHandInitial,
            bankerScore: calculateHandValue(bHandInitial),
        }));

        // Check Naturals
        if (isNatural(pHandInitial) || isNatural(bHandInitial)) {
            finalizeRound(pHandInitial, bHandInitial, currentBets, roundToken);
            return;
        }

        // Third Card Logic
        const finalPHand = [...pHandInitial];
        const finalBHand = [...bHandInitial];
        let playerThirdCard: Card | undefined;

        // Player's Turn
        const pAction = getPlayerThirdCardAction(pHandInitial);
        if (pAction === 'draw') {
            setGameState(prev => ({ ...prev, phase: GamePhase.PlayerThirdCard, message: '闲家补牌...' }));
            if (!(await scheduleWait(roundToken))) return;
            playerThirdCard = drawCard();
            finalPHand.push(playerThirdCard);
            setGameState(prev => ({
                ...prev,
                playerHand: finalPHand,
                playerScore: calculateHandValue(finalPHand)
            }));
        }

        // Banker's Turn
        const bAction = getBankerThirdCardAction(bHandInitial, playerThirdCard);
        if (bAction === 'draw') {
            setGameState(prev => ({ ...prev, phase: GamePhase.BankerThirdCard, message: '庄家补牌...' }));
            if (!(await scheduleWait(roundToken))) return;
            const b3 = drawCard();
            finalBHand.push(b3);
            setGameState(prev => ({
                ...prev,
                bankerHand: finalBHand,
                bankerScore: calculateHandValue(finalBHand)
            }));
        }

        finalizeRound(finalPHand, finalBHand, currentBets, roundToken);
    };

    const finalizeRound = (
        pHand: Card[],
        bHand: Card[],
        bets: Record<string, number | undefined>,
        roundToken: number,
    ) => {
        if (roundToken !== roundTokenRef.current) return;
        const result = determineWinner(pHand, bHand);
        const pScore = calculateHandValue(pHand);
        const bScore = calculateHandValue(bHand);

        // Payout Calculation — uses passed-in bets (not stale closure)
        let totalPayout = 0;

        // 1. Player Bet
        if (bets['PLAYER']) {
            if (result === GameResult.PlayerWin) {
                totalPayout += bets['PLAYER']! * 2;
            } else if (result === GameResult.Tie) {
                totalPayout += bets['PLAYER']!; // Push
            }
        }

        // 2. Banker Bet
        if (bets['BANKER']) {
            if (result === GameResult.BankerWin) {
                totalPayout += bets['BANKER']! + (bets['BANKER']! * 0.95);
            } else if (result === GameResult.Tie) {
                totalPayout += bets['BANKER']!; // Push
            }
        }

        // 3. Tie Bet
        if (bets['TIE']) {
            if (result === GameResult.Tie) {
                totalPayout += bets['TIE']! * 9; // 8:1 payout (bet returned + 8x bet)
            }
        }

        // 4. Pairs Side Bets
        // We need to check if the INITIAL two cards form a pair.
        // pHand and bHand might have 3 cards now.
        const pHandInitial = [pHand[0], pHand[1]];
        const bHandInitial = [bHand[0], bHand[1]];
        const pPair = pHandInitial[0].rank === pHandInitial[1].rank;
        const bPair = bHandInitial[0].rank === bHandInitial[1].rank;

        if (bets['PLAYER_PAIR'] && pPair) {
            totalPayout += bets['PLAYER_PAIR']! * 12; // 11:1 payout (bet returned + 11x bet)
        }

        if (bets['BANKER_PAIR'] && bPair) {
            totalPayout += bets['BANKER_PAIR']! * 12; // 11:1 payout
        }

        const roundResult: RoundResult = {
            winner: result,
            playerScore: pScore,
            bankerScore: bScore,
            playerHand: pHand,
            bankerHand: bHand,
            timestamp: Date.now()
        };

        setPlayerState((prev) => ({
            ...prev,
            currentBet: 0,
            bets: {},
        }));
        creditBalance(totalPayout);

        setGameState((prev) => ({
            ...prev,
            phase: GamePhase.Result,
            message: `${result === GameResult.Tie ? '和局' : result === GameResult.PlayerWin ? '闲家赢!' : '庄家赢!'}`,
            history: [roundResult, ...prev.history],
        }));

        // Check if we need to reshuffle for the NEXT round
        if (deckRef.current.shouldReshuffle()) {
            deckRef.current.reset();
            setDeckRemaining(deckRef.current.remaining);
            setGameState(prev => ({ ...prev, message: prev.message + ' (洗牌中...)' }));
        }
    };

    const resetForNewGame = () => {
        clearPendingRound();
        setGameState(prev => ({
            ...prev,
            phase: GamePhase.Betting,
            playerHand: [],
            bankerHand: [],
            playerScore: 0,
            bankerScore: 0,
            message: '请下注'
        }));
    };

    const resetBalance = () => {
        clearPendingRound();
        resetPersistedBalance();
        deckRef.current.reset();
        setDeckRemaining(deckRef.current.remaining);
        setPlayerState({
            balance: 0,
            currentBet: 0,
            bets: {}
        });
        setGameState(prev => ({
            ...prev,
            phase: GamePhase.Betting,
            playerHand: [],
            bankerHand: [],
            playerScore: 0,
            bankerScore: 0,
            message: '请下注'
        }));
    };

    useEffect(() => clearPendingRound, [clearPendingRound]);

    return {
        gameState,
        playerState: { ...playerState, balance },
        placeBet,
        clearBet,
        startGame,
        resetForNewGame,
        resetBalance,
        deckRemaining
    };
};
