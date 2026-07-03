import { GameResult } from './Rules';
import { getSecureRandomFloat, getSecureRandomInt } from '../../../logic/Random';

export interface Bet {
    type: 'PLAYER' | 'BANKER' | 'TIE';
    amount: number;
}

export const BACCARAT_STRATEGY_OPTIONS: { name: string; description: string }[] = [
    { name: '平注押闲 (Flat Player)', description: '每局固定注码押闲' },
    { name: '平注押庄 (Flat Banker)', description: '每局固定注码押庄' },
    { name: '倍投押闲 (Martingale Player)', description: '输后翻倍注码押闲' },
    { name: '倍投押庄 (Martingale Banker)', description: '输后翻倍注码押庄' },
    { name: '倍投随机 (Martingale Random)', description: '输后翻倍，随机押庄闲' },
    { name: '全程押和 (Always Tie)', description: '每局固定注码押和' },
    { name: '随机下注 (Random)', description: '45%闲/45%庄/10%和随机' },
];

export const createBaccaratStrategy = (index: number, baseBet: number): BettingStrategy => {
    switch (index) {
        case 0: return new FlatBetStrategy(baseBet, 'PLAYER');
        case 1: return new FlatBetStrategy(baseBet, 'BANKER');
        case 2: return new MartingaleStrategy(baseBet, 'PLAYER');
        case 3: return new MartingaleStrategy(baseBet, 'BANKER');
        case 4: return new MartingaleRandomStrategy(baseBet);
        case 5: return new AlwaysTieStrategy(baseBet);
        case 6: return new RandomStrategy(baseBet);
        default: return new FlatBetStrategy(baseBet, 'PLAYER');
    }
};

export interface BettingStrategy {
    name: string;
    description: string;
    reset(): void;
    getBet(history: GameResult[], currentBalance: number, lastBet: Bet | null, lastResult: GameResult | null): Bet;
}

export class FlatBetStrategy implements BettingStrategy {
    name = "Flat Betting (平注)";
    description = "Always bet the same amount on Player.";

    private baseBet: number;
    private target: 'PLAYER' | 'BANKER';

    constructor(baseBet: number = 100, target: 'PLAYER' | 'BANKER' = 'PLAYER') {
        this.baseBet = baseBet;
        this.target = target;
    }

    reset() { }

    getBet(): Bet {
        return { type: this.target, amount: this.baseBet };
    }
}

export class MartingaleStrategy implements BettingStrategy {
    name = "Martingale (倍投法)";
    description = "Double bet after loss. Reset to base bet after win.";

    private baseBet: number;
    private currentBet: number;
    private target: 'PLAYER' | 'BANKER';

    constructor(baseBet: number = 100, target: 'PLAYER' | 'BANKER' = 'PLAYER') {
        this.baseBet = baseBet;
        this.currentBet = baseBet;
        this.target = target;
    }

    reset() {
        this.currentBet = this.baseBet;
    }

    getBet(_history: GameResult[], currentBalance: number, lastBet: Bet | null, lastResult: GameResult | null): Bet {
        // If first round, bet base
        if (!lastBet || lastResult === null) {
            this.currentBet = this.baseBet;
            return { type: this.target, amount: this.currentBet };
        }

        // Check if we won the last bet
        let won = false;
        if (lastBet.type === 'PLAYER' && lastResult === GameResult.PlayerWin) won = true;
        if (lastBet.type === 'BANKER' && lastResult === GameResult.BankerWin) won = true;
        if (lastBet.type === 'TIE' && lastResult === GameResult.Tie) won = true;

        if (lastResult === GameResult.Tie && lastBet.type !== 'TIE') {
            // Push, keep same bet
            // Don't change currentBet
        } else if (won) {
            // Reset on win
            this.currentBet = this.baseBet;
        } else {
            // Double on loss
            this.currentBet *= 2;
        }

        // Cap bet at balance (All-in)
        if (this.currentBet > currentBalance) {
            this.currentBet = currentBalance;
        }

        return { type: this.target, amount: this.currentBet };
    }
}

export class AlwaysTieStrategy implements BettingStrategy {
    name = "Always Tie (全程押和)";
    description = "Always bet on Tie.";

    private baseBet: number;

    constructor(baseBet: number = 100) {
        this.baseBet = baseBet;
    }

    reset() { }

    getBet(): Bet {
        return { type: 'TIE', amount: this.baseBet };
    }
}

export class RandomStrategy implements BettingStrategy {
    name = "Random (随机下注)";
    description = "Randomly bets on Player (45%), Banker (45%), or Tie (10%).";

    private baseBet: number;

    constructor(baseBet: number = 100) {
        this.baseBet = baseBet;
    }

    reset() { }

    getBet(): Bet {
        const rand = getSecureRandomFloat();
        let type: 'PLAYER' | 'BANKER' | 'TIE';

        if (rand < 0.45) type = 'PLAYER';
        else if (rand < 0.90) type = 'BANKER';
        else type = 'TIE';

        return { type, amount: this.baseBet };
    }
}

export class MartingaleRandomStrategy implements BettingStrategy {
    name = "Martingale Random (倍投随机)";
    description = "Bets randomly (Player/Banker) but doubles bet after loss.";

    private baseBet: number;
    private currentBet: number;

    constructor(baseBet: number = 100) {
        this.baseBet = baseBet;
        this.currentBet = baseBet;
    }

    reset() {
        this.currentBet = this.baseBet;
    }

    getBet(_history: GameResult[], currentBalance: number, lastBet: Bet | null, lastResult: GameResult | null): Bet {
        // Random target logic
        // 50/50 for Player/Banker, ignoring Tie for target selection
        const type: 'PLAYER' | 'BANKER' = getSecureRandomInt(2) === 0 ? 'PLAYER' : 'BANKER';

        // Martingale logic
        if (!lastBet || lastResult === null) {
            this.currentBet = this.baseBet;
        } else {
            // Check if we won the last bet
            let won = false;
            if (lastBet.type === 'PLAYER' && lastResult === GameResult.PlayerWin) won = true;
            if (lastBet.type === 'BANKER' && lastResult === GameResult.BankerWin) won = true;
            if (lastBet.type === 'TIE' && lastResult === GameResult.Tie) won = true;

            if (lastResult === GameResult.Tie && lastBet.type !== 'TIE') {
                // Push, keep same bet amount
            } else if (won) {
                // Reset on win
                this.currentBet = this.baseBet;
            } else {
                // Double on loss
                this.currentBet *= 2;
            }
        }

        // Cap bet at balance (All-in)
        if (this.currentBet > currentBalance) {
            this.currentBet = currentBalance;
        }

        return { type, amount: this.currentBet };
    }
}
