// ===== 老虎机下注策略 =====

export interface SlotStrategy {
    name: string;
    description: string;
    /** 计算每线下注金额，返回 0 表示停止 */
    getNextBet: (balance: number, baseBet: number, lastWin: number) => number;
}

/** 固定注额策略：每次下注相同金额 */
const flatBetStrategy: SlotStrategy = {
    name: '固定注额',
    description: '每次旋转使用相同的每线下注金额。',
    getNextBet: (balance, baseBet, lastWin) => {
        void balance;
        void lastWin;
        return baseBet;
    },
};

/** 比例下注策略：按余额的百分比下注 */
const proportionalStrategy: SlotStrategy = {
    name: '比例下注',
    description: '每次下注为当前余额的固定百分比（默认 1%），更保守的资金管理。',
    getNextBet: (balance, baseBet, lastWin) => {
        void baseBet;
        void lastWin;
        const bet = Math.max(1, Math.floor(balance * 0.01));
        return bet;
    },
};

/** 马丁格尔策略：输了翻倍，赢了回到基础注额 */
const martingaleStrategy: SlotStrategy = {
    name: '马丁格尔',
    description: '输了翻倍下注，赢了回到基础注额。在老虎机中风险极高。',
    getNextBet: (balance, baseBet, lastWin) => {
        if (lastWin > 0) return baseBet;
        return Math.min(baseBet * 2, balance);
    },
};

const paroliStrategy: SlotStrategy = {
    name: '反马丁格尔',
    description: '中奖后加倍，未中奖回到基础注额，测试顺势追击。',
    getNextBet: (balance, baseBet, lastWin) => {
        const nextBet = lastWin > 0 ? baseBet * 2 : baseBet;
        return Math.min(nextBet, balance);
    },
};

const conservativeStrategy: SlotStrategy = {
    name: '保守递减',
    description: '未中奖后降到半注，中奖后恢复基注，降低连续亏损速度。',
    getNextBet: (balance, baseBet, lastWin) => {
        const nextBet = lastWin > 0 ? baseBet : Math.max(1, Math.floor(baseBet / 2));
        return Math.min(nextBet, balance);
    },
};

const stopWinChaseStrategy: SlotStrategy = {
    name: '止盈追击',
    description: '中奖后用部分赢额加注，未中奖回到基础注额。',
    getNextBet: (balance, baseBet, lastWin) => {
        const nextBet = lastWin > 0 ? baseBet + Math.floor(lastWin * 0.25) : baseBet;
        return Math.min(nextBet, balance);
    },
};

const highVarianceStrategy: SlotStrategy = {
    name: '高波动满线',
    description: '每线下注提升到 3 倍基注，放大 RTP 周围的短期波动。',
    getNextBet: (balance, baseBet, lastWin) => {
        void lastWin;
        return Math.min(baseBet * 3, balance);
    },
};

export const ALL_STRATEGIES: SlotStrategy[] = [
    flatBetStrategy,
    proportionalStrategy,
    martingaleStrategy,
    paroliStrategy,
    conservativeStrategy,
    stopWinChaseStrategy,
    highVarianceStrategy,
];
