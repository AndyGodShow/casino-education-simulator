// ===== 三公策略 =====
import type { SanGongBet } from '../types';
import { getSecureRandomInt } from '../../../logic/Random';

export interface SGStrategy {
    name: string;
    description: string;
    getBets: (baseBet: number) => SanGongBet[];
}

const splitBet = (baseBet: number, parts: number): number => Math.max(1, Math.floor(baseBet / parts));

export const ALL_SG_STRATEGIES: SGStrategy[] = [
    { name: '固定押闲', description: '每轮押闲赢，赔率 1:1', getBets: (b) => [{ type: 'player_wins', amount: b }] },
    { name: '固定押庄', description: '每轮押庄赢，赔率 0.95:1（抽佣5%）', getBets: (b) => [{ type: 'banker_wins', amount: b }] },
    { name: '固定押和', description: '每轮押和局，赔率 8:1，赌场优势极高', getBets: (b) => [{ type: 'tie', amount: b }] },
    { name: '庄闲交替', description: '随机押庄或闲', getBets: (b) => [{ type: getSecureRandomInt(2) === 0 ? 'player_wins' : 'banker_wins', amount: b }] },
    {
        name: '闲 + 和局保险',
        description: '主押闲，少量押和，观察保险投注是否改善回撤。',
        getBets: (b) => [
            { type: 'player_wins', amount: b },
            { type: 'tie', amount: splitBet(b, 5) },
        ],
    },
    {
        name: '庄闲 + 和局保险',
        description: '同时押庄闲并小额押和，展示高覆盖率不等于高收益。',
        getBets: (b) => [
            { type: 'player_wins', amount: splitBet(b, 2) },
            { type: 'banker_wins', amount: splitBet(b, 2) },
            { type: 'tie', amount: splitBet(b, 4) },
        ],
    },
    {
        name: '高风险押和',
        description: '用两倍基注押和局，专门观察高赔率投注的资金曲线。',
        getBets: (b) => [{ type: 'tie', amount: b * 2 }],
    },
];
