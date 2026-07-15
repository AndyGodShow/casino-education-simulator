import { Card } from '../../logic/Card';

export const BlackjackPhase = {
    Betting: 'BETTING',
    PlayerTurn: 'PLAYER_TURN',
    DealerTurn: 'DEALER_TURN',
    Result: 'RESULT',
} as const;

export type BlackjackPhase = typeof BlackjackPhase[keyof typeof BlackjackPhase];

interface BlackjackHand {
    cards: Card[];
    score: number;
    bet: number;
    isBust: boolean;
    isStay: boolean;
    status: 'active' | 'stay' | 'bust' | 'blackjack';
}

export interface BlackjackGameState {
    phase: BlackjackPhase;
    playerHands: BlackjackHand[];
    currentHandIndex: number;
    dealerHand: BlackjackHand;
    deckRemaining: number;
    message: string;
    history: BlackjackRoundResult[];
}

interface BlackjackRoundResult {
    playerScore: number[];
    dealerScore: number;
    winner: 'PLAYER' | 'DEALER' | 'PUSH' | 'BLACKJACK';
    timestamp: number;
}
