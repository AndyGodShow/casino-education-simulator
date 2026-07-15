// ===== 花旗骰（Craps）类型定义 =====

/** 骰子结果 */
export type CrapsDice = [number, number];

/** 下注类型 */
export type CrapsBetType =
    | 'pass_line'       // Pass Line 赔率 1:1
    | 'dont_pass'       // Don't Pass 赔率 1:1
    | 'come'            // Come （同 Pass Line，但在 Point 阶段下注）
    | 'dont_come'       // Don't Come
    | 'field'           // Field（2,3,4,9,10,11,12，2和12 赔 2:1 其余 1:1）
    | 'any_seven'       // Any Seven 赔率 4:1
    | 'any_craps'       // Any Craps (2,3,12) 赔率 7:1
    ;

/** 单次下注 */
export interface CrapsBet {
    type: CrapsBetType;
    amount: number;
}

/** 游戏阶段 */
export const CrapsPhase = {
    Betting: 'BETTING',
    Rolling: 'ROLLING',        // 掷骰中
    PointSet: 'POINT_SET',     // 已确定 Point
    PointRolling: 'POINT_ROLLING',
    Result: 'RESULT',
} as const;
export type CrapsPhase = typeof CrapsPhase[keyof typeof CrapsPhase];

/** 游戏圆状态 */
type CrapsRoundStatus = 'come_out' | 'point';

/** 游戏状态 */
export interface CrapsGameState {
    phase: CrapsPhase;
    roundStatus: CrapsRoundStatus;
    bets: CrapsBet[];
    dice: CrapsDice | null;
    point: number | null;        // 当前 Point
    history: { dice: CrapsDice; result: string; type?: string; sum?: number }[];
    message: string;
}
