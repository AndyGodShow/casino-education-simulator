// ===== 老虎机 (Slot Machine) 类型定义 =====

// 符号类型 — 从低赔到高赔排列
export type SlotSymbol = 'cherry' | 'lemon' | 'orange' | 'grape' | 'bell' | 'diamond' | 'seven' | 'wild';

// 符号 Emoji 映射
export const SYMBOL_EMOJI: Record<SlotSymbol, string> = {
    cherry: '🍒',
    lemon: '🍋',
    orange: '🍊',
    grape: '🍇',
    bell: '🔔',
    diamond: '💎',
    seven: '7️⃣',
    wild: '⭐',
};

// 赔付表: symbol -> [3连, 4连, 5连] 的赔率倍数
export const PAYTABLE: Record<SlotSymbol, [number, number, number]> = {
    cherry: [5, 15, 50],
    lemon: [5, 15, 50],
    orange: [10, 30, 100],
    grape: [10, 30, 100],
    bell: [20, 60, 200],
    diamond: [30, 100, 500],
    seven: [50, 200, 1000],
    wild: [100, 500, 2000],
};

// 符号在卷轴上的权重（当前演示配置理论 RTP 约 58%）
export const SYMBOL_WEIGHTS: Record<SlotSymbol, number> = {
    cherry: 30,
    lemon: 28,
    orange: 22,
    grape: 20,
    bell: 12,
    diamond: 6,
    seven: 3,
    wild: 2,
};

// 卷轴配置
export const REELS = 5;
export const ROWS = 3;
export const PAYLINES = 20;

// 20 条赔付线定义 (每条赔付线由 5 个行索引组成，对应 5 个卷轴)
// 行索引: 0=顶部, 1=中间, 2=底部
export const PAYLINE_PATTERNS: number[][] = [
    [1, 1, 1, 1, 1], // Line 1: 中间直线
    [0, 0, 0, 0, 0], // Line 2: 顶部直线
    [2, 2, 2, 2, 2], // Line 3: 底部直线
    [0, 1, 2, 1, 0], // Line 4: V 形
    [2, 1, 0, 1, 2], // Line 5: 倒 V 形
    [0, 0, 1, 0, 0], // Line 6
    [2, 2, 1, 2, 2], // Line 7
    [1, 0, 0, 0, 1], // Line 8
    [1, 2, 2, 2, 1], // Line 9
    [0, 1, 1, 1, 0], // Line 10
    [2, 1, 1, 1, 2], // Line 11
    [1, 0, 1, 0, 1], // Line 12: 锯齿形
    [1, 2, 1, 2, 1], // Line 13: 锯齿形
    [0, 1, 0, 1, 0], // Line 14
    [2, 1, 2, 1, 2], // Line 15
    [0, 0, 1, 2, 2], // Line 16: 下斜
    [2, 2, 1, 0, 0], // Line 17: 上斜
    [1, 0, 1, 2, 1], // Line 18
    [1, 2, 1, 0, 1], // Line 19
    [0, 2, 0, 2, 0], // Line 20
];

// 游戏阶段
export const SlotPhase = {
    Betting: 'BETTING',
    Spinning: 'SPINNING',
    Result: 'RESULT',
} as const;

export type SlotPhase = typeof SlotPhase[keyof typeof SlotPhase];

// 单条赔付线结果
export interface PaylineResult {
    lineIndex: number;       // 赔付线编号 (0-19)
    symbol: SlotSymbol;      // 匹配的符号
    count: number;           // 连续匹配数量 (3-5)
    payout: number;          // 此线赔付金额
    positions: number[];     // 行位置 [row0, row1, row2, row3, row4]
}

// 单次旋转结果
export interface SpinResult {
    reels: SlotSymbol[][];   // 5×3 符号矩阵 (reels[col][row])
    paylines: PaylineResult[];
    totalWin: number;
}

// 游戏状态
export interface SlotGameState {
    phase: SlotPhase;
    reels: SlotSymbol[][];    // 当前显示的符号矩阵
    betPerLine: number;       // 每线下注
    activeLines: number;      // 激活赔付线数 (1-20)
    lastResult: SpinResult | null;
    history: { totalBet: number; totalWin: number }[];
    message: string;
}
