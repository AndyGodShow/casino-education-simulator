import { describe, expect, it } from 'vitest';
import {
    BATCH_TEST_METHODS,
    formatInteger,
    formatMoney,
    formatPercent,
    formatSignedMoney,
    getBatchTestMethod,
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
});
