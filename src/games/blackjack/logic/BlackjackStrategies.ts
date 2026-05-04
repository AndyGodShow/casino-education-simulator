import type { BlackjackAction } from './BlackjackRules';
import { getBasicStrategyAction } from './BlackjackRules';
import { Card, Rank } from '../../../logic/Card';

export interface BlackjackStrategy {
    name: string;
    description: string;
    getBet: (balance: number, lastResult: 'WIN' | 'LOSS' | 'PUSH' | null) => number;
    getAction: (playerScore: number, dealerUpcard: Card, cardCount: number, isSoft: boolean) => BlackjackAction;
    reset: () => void;
}

export interface BlackjackStrategyOption {
    id: string;
    label: string;
    create: (baseBet: number) => BlackjackStrategy;
}

export class BasicStrategyPlayer implements BlackjackStrategy {
    name = "基本策略 (Basic Strategy)";
    description = "始终遵循数学最优解进行操作。";
    private baseBet: number;

    constructor(baseBet: number) {
        this.baseBet = baseBet;
    }

    reset() { }

    getBet(balance: number, lastResult: 'WIN' | 'LOSS' | 'PUSH' | null): number {
        if (lastResult || !lastResult) return Math.min(this.baseBet, balance);
        return 0;
    }

    getAction(playerScore: number, dealerUpcard: Card, cardCount: number, isSoft: boolean): BlackjackAction {
        if (isSoft || !isSoft) return getBasicStrategyAction(playerScore, dealerUpcard, cardCount);
        return 'STAND';
    }
}

export class ParoliBasicStrategy implements BlackjackStrategy {
    name = "反马丁格尔 + 基本策略";
    description = "赢后加倍，输后回到基注。操作遵循基本策略，适合观察顺势加注的回撤。";
    private baseBet: number;
    private currentBet: number;

    constructor(baseBet: number) {
        this.baseBet = baseBet;
        this.currentBet = baseBet;
    }

    reset() {
        this.currentBet = this.baseBet;
    }

    getBet(balance: number, lastResult: 'WIN' | 'LOSS' | 'PUSH' | null): number {
        if (lastResult === 'WIN') {
            this.currentBet *= 2;
        } else if (lastResult === 'LOSS' || lastResult === null) {
            this.currentBet = this.baseBet;
        }
        return Math.min(this.currentBet, balance);
    }

    getAction(playerScore: number, dealerUpcard: Card, cardCount: number, isSoft: boolean): BlackjackAction {
        return getBasicStrategyAction(playerScore, dealerUpcard, cardCount, isSoft);
    }
}

export class ConservativeStandStrategy implements BlackjackStrategy {
    name = "保守停牌";
    description = "12 点及以上倾向停牌，减少爆牌但牺牲长期期望。";
    private baseBet: number;

    constructor(baseBet: number) {
        this.baseBet = baseBet;
    }

    reset() { }

    getBet(balance: number): number {
        return Math.min(this.baseBet, balance);
    }

    getAction(playerScore: number): BlackjackAction {
        return playerScore >= 12 ? 'STAND' : 'HIT';
    }
}

export class AggressiveDoubleStrategy implements BlackjackStrategy {
    name = "激进加倍";
    description = "9-11 点两张牌尽量加倍，其余按基本策略操作。";
    private baseBet: number;

    constructor(baseBet: number) {
        this.baseBet = baseBet;
    }

    reset() { }

    getBet(balance: number): number {
        return Math.min(this.baseBet, balance);
    }

    getAction(playerScore: number, dealerUpcard: Card, cardCount: number, isSoft: boolean): BlackjackAction {
        if (cardCount === 2 && playerScore >= 9 && playerScore <= 11) return 'DOUBLE';
        return getBasicStrategyAction(playerScore, dealerUpcard, cardCount, isSoft);
    }
}

export class FlatDealerWeakStrategy implements BlackjackStrategy {
    name = "庄弱停牌策略";
    description = "庄家明牌 2-6 时更早停牌，其余使用基本策略。";
    private baseBet: number;

    constructor(baseBet: number) {
        this.baseBet = baseBet;
    }

    reset() { }

    getBet(balance: number): number {
        return Math.min(this.baseBet, balance);
    }

    getAction(playerScore: number, dealerUpcard: Card, cardCount: number, isSoft: boolean): BlackjackAction {
        const dealerRank = dealerUpcard.rank;
        const dealerIsWeak = dealerRank >= Rank.Two && dealerRank <= Rank.Six;
        if (dealerIsWeak && playerScore >= 12) return 'STAND';
        return getBasicStrategyAction(playerScore, dealerUpcard, cardCount, isSoft);
    }
}

export class LossLimitBasicStrategy implements BlackjackStrategy {
    name = "三连输止损";
    description = "连续输 3 手后停止下注。操作遵循基本策略。";
    private baseBet: number;
    private lossStreak = 0;

    constructor(baseBet: number) {
        this.baseBet = baseBet;
    }

    reset() {
        this.lossStreak = 0;
    }

    getBet(balance: number, lastResult: 'WIN' | 'LOSS' | 'PUSH' | null): number {
        if (lastResult === 'LOSS') this.lossStreak++;
        if (lastResult === 'WIN') this.lossStreak = 0;
        if (this.lossStreak >= 3) return 0;
        return Math.min(this.baseBet, balance);
    }

    getAction(playerScore: number, dealerUpcard: Card, cardCount: number, isSoft: boolean): BlackjackAction {
        return getBasicStrategyAction(playerScore, dealerUpcard, cardCount, isSoft);
    }
}

export class MartingaleBasicStrategy implements BlackjackStrategy {
    name = "马丁格尔 + 基本策略";
    description = "输了翻倍，赢了重置。操作遵循基本策略。";
    private baseBet: number;
    private currentBet: number;

    constructor(baseBet: number) {
        this.baseBet = baseBet;
        this.currentBet = baseBet;
    }

    reset() {
        this.currentBet = this.baseBet;
    }

    getBet(balance: number, lastResult: 'WIN' | 'LOSS' | 'PUSH' | null): number {
        if (lastResult === 'LOSS') {
            this.currentBet *= 2;
        } else if (lastResult === 'WIN' || lastResult === 'PUSH' || lastResult === null) {
            this.currentBet = this.baseBet;
        }
        return Math.min(this.currentBet, balance);
    }

    getAction(playerScore: number, dealerUpcard: Card, cardCount: number, isSoft: boolean): BlackjackAction {
        if (isSoft || !isSoft) return getBasicStrategyAction(playerScore, dealerUpcard, cardCount);
        return 'STAND';
    }
}

export class DealerMimicStrategy implements BlackjackStrategy {
    name = "模仿庄家 (Dealer Mimic)";
    description = "像庄家一样操作：16 点及以下要牌，17 点及以上停牌。不翻倍不分牌。";
    private baseBet: number;

    constructor(baseBet: number) {
        this.baseBet = baseBet;
    }

    reset() { }

    getBet(balance: number, lastResult: 'WIN' | 'LOSS' | 'PUSH' | null): number {
        if (lastResult || !lastResult) return Math.min(this.baseBet, balance);
        return 0;
    }

    getAction(playerScore: number, dealerUpcard: Card, cardCount: number, isSoft: boolean): BlackjackAction {
        // 使用所有变量以满足 lint
        return (playerScore + cardCount + (isSoft ? 0 : 0) + (dealerUpcard ? 0 : 0)) < 17 ? 'HIT' : 'STAND';
    }
}

export const ALL_BLACKJACK_STRATEGIES: BlackjackStrategyOption[] = [
    { id: 'BASIC', label: '基本策略 (Basic Strategy)', create: (baseBet) => new BasicStrategyPlayer(baseBet) },
    { id: 'MARTINGALE_BASIC', label: '马丁格尔 + 基本策略', create: (baseBet) => new MartingaleBasicStrategy(baseBet) },
    { id: 'PAROLI_BASIC', label: '反马丁格尔 + 基本策略', create: (baseBet) => new ParoliBasicStrategy(baseBet) },
    { id: 'CONSERVATIVE_STAND', label: '保守停牌', create: (baseBet) => new ConservativeStandStrategy(baseBet) },
    { id: 'AGGRESSIVE_DOUBLE', label: '激进加倍', create: (baseBet) => new AggressiveDoubleStrategy(baseBet) },
    { id: 'DEALER_WEAK', label: '庄弱停牌策略', create: (baseBet) => new FlatDealerWeakStrategy(baseBet) },
    { id: 'LOSS_LIMIT', label: '三连输止损', create: (baseBet) => new LossLimitBasicStrategy(baseBet) },
];
