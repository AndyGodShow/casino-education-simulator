import type { RouletteBetType, RouletteBet } from '../types';

export interface RouletteStrategy {
    name: string;
    description: string;
    reset(): void;
    getBets(balance: number, lastWon: boolean | null): RouletteBet[];
}

export interface RouletteStrategyOption {
    id: string;
    label: string;
    create: (baseBet: number) => RouletteStrategy;
}

/**
 * 平注外围 — 每局固定金额押一个外围区域
 */
class FlatOutsideStrategy implements RouletteStrategy {
    name: string;
    description: string;

    private baseBet: number;
    private betType: RouletteBetType;

    constructor(baseBet: number = 100, betType: RouletteBetType = 'red', label: string = '红色') {
        this.baseBet = baseBet;
        this.betType = betType;
        this.name = `平注押${label}`;
        this.description = `每局用固定金额押${label}。`;
    }

    reset() { }

    getBets(balance: number): RouletteBet[] {
        const amount = Math.min(this.baseBet, balance);
        if (amount <= 0) return [];
        return [{ type: this.betType, amount }];
    }
}

export class FlatRedStrategy extends FlatOutsideStrategy {
    constructor(baseBet: number = 100) {
        super(baseBet, 'red', '红色');
        this.name = "平注押红 (Flat Red)";
        this.description = "每局用固定金额押红色。";
    }
}

/**
 * 倍投押红 — 输则翻倍，赢则回基注
 */
class MartingaleRedStrategy implements RouletteStrategy {
    name = "倍投押红 (Martingale Red)";
    description = "押红色，输了翻倍，赢了重置为基注。";

    private baseBet: number;
    private currentBet: number;

    constructor(baseBet: number = 100) {
        this.baseBet = baseBet;
        this.currentBet = baseBet;
    }

    reset() {
        this.currentBet = this.baseBet;
    }

    getBets(balance: number, lastWon: boolean | null): RouletteBet[] {
        if (lastWon === null) {
            this.currentBet = this.baseBet;
        } else if (lastWon) {
            this.currentBet = this.baseBet;
        } else {
            this.currentBet *= 2;
        }

        const amount = Math.min(this.currentBet, balance);
        if (amount <= 0) return [];
        return [{ type: 'red', amount }];
    }
}

class DAlembertRedStrategy implements RouletteStrategy {
    name = "达朗贝尔押红";
    description = "输后加一个基注，赢后减一个基注，比马丁格尔更平缓。";

    private baseBet: number;
    private units = 1;

    constructor(baseBet: number = 100) {
        this.baseBet = baseBet;
    }

    reset() {
        this.units = 1;
    }

    getBets(balance: number, lastWon: boolean | null): RouletteBet[] {
        if (lastWon === false) this.units++;
        if (lastWon === true) this.units = Math.max(1, this.units - 1);
        const amount = Math.min(this.baseBet * this.units, balance);
        if (amount <= 0) return [];
        return [{ type: 'red', amount }];
    }
}

class ParoliRedStrategy implements RouletteStrategy {
    name = "反马丁格尔押红";
    description = "赢后翻倍，输后回到基注，观察顺势加注的波动。";

    private baseBet: number;
    private currentBet: number;

    constructor(baseBet: number = 100) {
        this.baseBet = baseBet;
        this.currentBet = baseBet;
    }

    reset() {
        this.currentBet = this.baseBet;
    }

    getBets(balance: number, lastWon: boolean | null): RouletteBet[] {
        if (lastWon) this.currentBet *= 2;
        if (lastWon === false || lastWon === null) this.currentBet = this.baseBet;
        const amount = Math.min(this.currentBet, balance);
        if (amount <= 0) return [];
        return [{ type: 'red', amount }];
    }
}

class DozenRotationStrategy implements RouletteStrategy {
    name = "十二分区轮换";
    description = "按第一/第二/第三打轮换下注，测试分区押注的波动。";

    private baseBet: number;
    private index = 0;
    private betTypes: RouletteBetType[] = ['dozen1', 'dozen2', 'dozen3'];

    constructor(baseBet: number = 100) {
        this.baseBet = baseBet;
    }

    reset() {
        this.index = 0;
    }

    getBets(balance: number): RouletteBet[] {
        const amount = Math.min(this.baseBet, balance);
        if (amount <= 0) return [];
        const type = this.betTypes[this.index % this.betTypes.length];
        this.index++;
        return [{ type, amount }];
    }
}

class ColumnSpreadStrategy implements RouletteStrategy {
    name = "双列覆盖";
    description = "同时押两列，命中率更高但单次利润较小。";

    private baseBet: number;

    constructor(baseBet: number = 100) {
        this.baseBet = baseBet;
    }

    reset() { }

    getBets(balance: number): RouletteBet[] {
        const amount = Math.min(this.baseBet, Math.floor(balance / 2));
        if (amount <= 0) return [];
        return [
            { type: 'column1', amount },
            { type: 'column2', amount },
        ];
    }
}

class StraightNumberStrategy implements RouletteStrategy {
    name = "直注 17";
    description = "固定押单号 17，赔率高但命中率极低。";

    private baseBet: number;

    constructor(baseBet: number = 100) {
        this.baseBet = baseBet;
    }

    reset() { }

    getBets(balance: number): RouletteBet[] {
        const amount = Math.min(this.baseBet, balance);
        if (amount <= 0) return [];
        return [{ type: 'straight', value: 17, amount }];
    }
}

export const ALL_ROULETTE_STRATEGIES: RouletteStrategyOption[] = [
    { id: 'FLAT_RED', label: '平注押红 (Flat Red)', create: (baseBet) => new FlatRedStrategy(baseBet) },
    { id: 'FLAT_BLACK', label: '平注押黑', create: (baseBet) => new FlatOutsideStrategy(baseBet, 'black', '黑色') },
    { id: 'FLAT_EVEN', label: '平注押双', create: (baseBet) => new FlatOutsideStrategy(baseBet, 'even', '双数') },
    { id: 'MARTINGALE_RED', label: '倍投押红 (Martingale Red)', create: (baseBet) => new MartingaleRedStrategy(baseBet) },
    { id: 'DALEMBERT_RED', label: '达朗贝尔押红', create: (baseBet) => new DAlembertRedStrategy(baseBet) },
    { id: 'PAROLI_RED', label: '反马丁格尔押红', create: (baseBet) => new ParoliRedStrategy(baseBet) },
    { id: 'DOZEN_ROTATION', label: '十二分区轮换', create: (baseBet) => new DozenRotationStrategy(baseBet) },
    { id: 'COLUMN_SPREAD', label: '双列覆盖', create: (baseBet) => new ColumnSpreadStrategy(baseBet) },
    { id: 'STRAIGHT_17', label: '直注 17', create: (baseBet) => new StraightNumberStrategy(baseBet) },
];
