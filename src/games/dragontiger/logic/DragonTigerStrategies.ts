// ===== 龙虎斗策略 =====

import type { DragonTigerBet } from '../types';

interface DTStrategy {
    name: string;
    description: string;
    getBets: (baseBet: number) => DragonTigerBet[];
}

const splitBet = (baseBet: number, parts: number): number => Math.max(1, Math.floor(baseBet / parts));

export const ALL_DT_STRATEGIES: DTStrategy[] = [
    {
        name: '固定押龙',
        description: '每轮固定押龙，赔率 1:1，赌场优势约 3.73%',
        getBets: (b) => [{ type: 'dragon', amount: b }],
    },
    {
        name: '固定押虎',
        description: '每轮固定押虎，赔率 1:1，赌场优势约 3.73%',
        getBets: (b) => [{ type: 'tiger', amount: b }],
    },
    {
        name: '固定押和',
        description: '每轮固定押和，赔率 8:1，赌场优势高达 32.77%',
        getBets: (b) => [{ type: 'tie', amount: b }],
    },
    {
        name: '龙虎交替',
        description: '龙虎随机交替押注',
        getBets: (b) => [{ type: Math.random() > 0.5 ? 'dragon' : 'tiger', amount: b }],
    },
    {
        name: '龙 + 小和对冲',
        description: '主押龙，少量押和，用保险思路换取更高波动。',
        getBets: (b) => [
            { type: 'dragon', amount: b },
            { type: 'tie', amount: splitBet(b, 5) },
        ],
    },
    {
        name: '虎 + 小和对冲',
        description: '主押虎，少量押和，对比龙侧对冲效果。',
        getBets: (b) => [
            { type: 'tiger', amount: b },
            { type: 'tie', amount: splitBet(b, 5) },
        ],
    },
    {
        name: '高波动三向',
        description: '同时押龙、虎、和，测试覆盖率与净收益之间的矛盾。',
        getBets: (b) => [
            { type: 'dragon', amount: splitBet(b, 2) },
            { type: 'tiger', amount: splitBet(b, 2) },
            { type: 'tie', amount: splitBet(b, 3) },
        ],
    },
];
