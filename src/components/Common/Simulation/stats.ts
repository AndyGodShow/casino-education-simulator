export const formatPercent = (value: number, total: number, digits: number = 2): string => {
    if (total <= 0) return (0).toFixed(digits);
    return ((value / total) * 100).toFixed(digits);
};

export const MAIN_THREAD_SIMULATION_WARNING = '大样本模拟会在浏览器主线程运行，运行中界面可能短暂卡顿。';

type BatchTestMethodId = 'standard' | 'long_run' | 'capital_stress' | 'volatility';

interface BatchTestMethod {
    id: BatchTestMethodId;
    label: string;
    description: string;
    rounds?: number;
    initialBalance?: number;
    baseBetMultiplier?: number;
}

export const BATCH_TEST_METHODS: BatchTestMethod[] = [
    {
        id: 'standard',
        label: '标准抽样',
        description: '使用当前输入，适合快速比较策略。',
    },
    {
        id: 'long_run',
        label: '长期收敛',
        description: '固定 20,000 局，观察概率和 RTP 是否向理论值靠近。',
        rounds: 20000,
    },
    {
        id: 'capital_stress',
        label: '小本金压力',
        description: '固定 2,000 局 / $1,000 本金，观察破产和连输风险。',
        rounds: 2000,
        initialBalance: 1000,
    },
    {
        id: 'volatility',
        label: '高注码波动',
        description: '固定 5,000 局，注码提升 6 倍，放大资金曲线波动。',
        rounds: 5000,
        baseBetMultiplier: 6,
    },
];

export const formatInteger = (value: number): string => Math.round(value).toLocaleString('en-US');

export const formatMoney = (value: number): string => {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${formatInteger(Math.abs(value))}`;
};

export const formatSignedMoney = (value: number): string => {
    if (value === 0) return '$0';
    return `${value > 0 ? '+' : '-'}$${formatInteger(Math.abs(value))}`;
};

export const getBatchTestMethod = (id: string): BatchTestMethod =>
    BATCH_TEST_METHODS.find(method => method.id === id) ?? BATCH_TEST_METHODS[0];

const clampFiniteInteger = (value: number, fallback: number, min: number, max: number): number => {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.round(value)));
};

export const resolveBatchTestConfig = (
    methodId: string,
    rounds: number,
    baseBet: number,
    initialBalance: number,
) => {
    const method = getBatchTestMethod(methodId);
    const safeBaseBet = clampFiniteInteger(baseBet, 100, 1, 10000);
    return {
        rounds: method.rounds ?? clampFiniteInteger(rounds, 1000, 10, 100000),
        baseBet: clampFiniteInteger(safeBaseBet * (method.baseBetMultiplier ?? 1), safeBaseBet, 1, 10000),
        initialBalance: method.initialBalance ?? clampFiniteInteger(initialBalance, 10000, 100, 1000000),
    };
};
