// ===== 骰宝投注策略 =====

import type { SicBoBet } from '../types';
import { getSecureRandomInt } from '../../../logic/Random';

export interface SicBoStrategy {
    name: string;
    description: string;
    getBets: (baseBet: number) => SicBoBet[];
}

const splitBet = (baseBet: number, parts: number): number => Math.max(1, Math.floor(baseBet / parts));

/** 固定押大 */
const bigStrategy: SicBoStrategy = {
    name: '固定押大',
    description: '每轮固定押大（总和 11-17），赔率 1:1，赌场优势 2.78%',
    getBets: (baseBet: number) => [{ type: 'big', amount: baseBet }],
};

/** 固定押小 */
const smallStrategy: SicBoStrategy = {
    name: '固定押小',
    description: '每轮固定押小（总和 4-10），赔率 1:1，赌场优势 2.78%',
    getBets: (baseBet: number) => [{ type: 'small', amount: baseBet }],
};

/** 大小交替 */
const alternateStrategy: SicBoStrategy = {
    name: '大小交替',
    description: '大小轮流押注',
    getBets: (baseBet: number) => [
        { type: getSecureRandomInt(2) === 0 ? 'big' : 'small', amount: baseBet },
    ],
};

/** 单骰策略：固定押某个数字 */
const singleNumberStrategy: SicBoStrategy = {
    name: '单骰策略',
    description: '固定押单个数字出现（默认数字6），出现1次赔1:1，2次赔2:1，3次赔12:1',
    getBets: (baseBet: number) => [{ type: 'single', amount: baseBet, value: 6 }],
};

/** 组合策略：大 + 单骰 */
const comboStrategy: SicBoStrategy = {
    name: '组合策略',
    description: '同时押大和单骰6，分散风险',
    getBets: (baseBet: number) => [
        { type: 'big', amount: baseBet },
        { type: 'single', amount: Math.floor(baseBet / 2), value: 6 },
    ],
};

const oddEvenStrategy: SicBoStrategy = {
    name: '单双随机',
    description: '随机押单或双，和大小策略对照观察。',
    getBets: (baseBet: number) => [
        { type: getSecureRandomInt(2) === 0 ? 'odd' : 'even', amount: baseBet },
    ],
};

const anyTripleStrategy: SicBoStrategy = {
    name: '任意围骰',
    description: '押任意围骰，赔率 30:1，命中率低但波动高。',
    getBets: (baseBet: number) => [{ type: 'any_triple', amount: baseBet }],
};

const specificDoubleStrategy: SicBoStrategy = {
    name: '指定双骰 6',
    description: '押指定双骰 6，赔率 10:1，测试中高赔率投注。',
    getBets: (baseBet: number) => [{ type: 'specific_double', amount: baseBet, value: 6 }],
};

const totalClusterStrategy: SicBoStrategy = {
    name: '总和 10/11/12 组合',
    description: '押三个中间总和，命中更集中但总下注额更高。',
    getBets: (baseBet: number) => [
        { type: 'total', amount: splitBet(baseBet, 3), value: 10 },
        { type: 'total', amount: splitBet(baseBet, 3), value: 11 },
        { type: 'total', amount: splitBet(baseBet, 3), value: 12 },
    ],
};

/** 全部策略列表 */
export const ALL_STRATEGIES: SicBoStrategy[] = [
    bigStrategy,
    smallStrategy,
    alternateStrategy,
    oddEvenStrategy,
    singleNumberStrategy,
    comboStrategy,
    anyTripleStrategy,
    specificDoubleStrategy,
    totalClusterStrategy,
];
