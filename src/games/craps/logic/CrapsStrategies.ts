// ===== 花旗骰策略 =====
import type { CrapsBet } from '../types';

export interface CrapsStrategy {
    name: string;
    description: string;
    getBets: (baseBet: number) => CrapsBet[];
}

const splitBet = (baseBet: number, parts: number): number => Math.max(1, Math.floor(baseBet / parts));

export const ALL_CRAPS_STRATEGIES: CrapsStrategy[] = [
    { name: '过线注', description: '经典过线注（Pass Line），赌场优势仅 1.41%', getBets: (b) => [{ type: 'pass_line', amount: b }] },
    { name: '反过线注', description: '反过线注（Don\'t Pass），赌场优势 1.36%，略优于过线注', getBets: (b) => [{ type: 'dont_pass', amount: b }] },
    { name: '来注', description: '来注（Come），批量模拟使用独立决议轮近似，不完全复刻单局 Point 阶段交互流程', getBets: (b) => [{ type: 'come', amount: b }] },
    { name: '反来注', description: '反来注（Don\'t Come），批量模拟使用独立决议轮近似，不完全复刻单局 Point 阶段交互流程', getBets: (b) => [{ type: 'dont_come', amount: b }] },
    { name: '区域注', description: '区域注（Field，单轮结算），赌场优势约 5.56%', getBets: (b) => [{ type: 'field', amount: b }] },
    { name: '任意七', description: '任意七（Any Seven）赔率 4:1，但赌场优势高达 16.67%', getBets: (b) => [{ type: 'any_seven', amount: b }] },
    { name: '任意花旗点', description: '任意花旗点（2,3,12）赔率 7:1，赌场优势 11.11%', getBets: (b) => [{ type: 'any_craps', amount: b }] },
    {
        name: '保守组合',
        description: '过线注 + 区域注小额组合，观察低优势主线搭配单轮波动。',
        getBets: (b) => [
            { type: 'pass_line', amount: b },
            { type: 'field', amount: splitBet(b, 2) },
        ],
    },
    {
        name: '高风险组合',
        description: '任意七 + 任意花旗点，高赔率但长期回撤明显。',
        getBets: (b) => [
            { type: 'any_seven', amount: splitBet(b, 2) },
            { type: 'any_craps', amount: splitBet(b, 2) },
        ],
    },
];
