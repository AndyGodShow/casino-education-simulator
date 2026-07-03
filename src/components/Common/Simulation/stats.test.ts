import { describe, expect, it } from 'vitest';
import {
    BATCH_TEST_METHODS,
    formatInteger,
    formatMoney,
    formatPercent,
    formatSignedMoney,
    getBatchTestMethod,
    MAIN_THREAD_SIMULATION_WARNING,
    resolveBatchTestConfig,
} from './stats';

describe('simulation stats formatting', () => {
    it('formats shared batch metrics consistently', () => {
        expect(formatInteger(1234567)).toBe('1,234,567');
        expect(formatMoney(12345.67)).toBe('$12,346');
        expect(formatSignedMoney(230.4)).toBe('+$230');
        expect(formatSignedMoney(-230.4)).toBe('-$230');
        expect(formatPercent(1, 3)).toBe('33.33');
    });

    it('resolves batch test methods without mutating manual input', () => {
        expect(BATCH_TEST_METHODS.map(method => method.id)).toEqual([
            'standard',
            'long_run',
            'capital_stress',
            'volatility',
        ]);

        expect(getBatchTestMethod('missing').id).toBe('standard');
        expect(resolveBatchTestConfig('long_run', 250, 25, 8000)).toEqual({
            rounds: 20000,
            baseBet: 25,
            initialBalance: 8000,
        });
        expect(resolveBatchTestConfig('capital_stress', 250, 25, 8000)).toEqual({
            rounds: 2000,
            baseBet: 25,
            initialBalance: 1000,
        });
        expect(resolveBatchTestConfig('volatility', 250, 25, 8000)).toEqual({
            rounds: 5000,
            baseBet: 150,
            initialBalance: 8000,
        });
    });

    it('clamps invalid manual simulation inputs before running engines', () => {
        expect(resolveBatchTestConfig('standard', Number.NaN, Number.POSITIVE_INFINITY, -500)).toEqual({
            rounds: 1000,
            baseBet: 100,
            initialBalance: 100,
        });

        expect(resolveBatchTestConfig('standard', 1_000_000, 0, Number.POSITIVE_INFINITY)).toEqual({
            rounds: 100000,
            baseBet: 1,
            initialBalance: 10000,
        });

        expect(resolveBatchTestConfig('volatility', 100, 9000, 5000)).toEqual({
            rounds: 5000,
            baseBet: 10000,
            initialBalance: 5000,
        });
    });

    it('documents that browser simulations run on the main thread', () => {
        expect(MAIN_THREAD_SIMULATION_WARNING).toContain('主线程');
        expect(MAIN_THREAD_SIMULATION_WARNING).toContain('卡顿');
    });
});
