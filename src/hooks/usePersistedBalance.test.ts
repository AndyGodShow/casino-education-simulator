import { describe, expect, it } from 'vitest';
import { MAX_SAFE_BALANCE, sanitizeBalance } from './usePersistedBalance';

describe('persisted balance sanitization', () => {
    it('keeps only finite non-negative balances', () => {
        expect(sanitizeBalance('2500', 10000)).toBe(2500);
        expect(sanitizeBalance(0, 10000)).toBe(0);
        expect(sanitizeBalance('', 10000)).toBe(10000);
        expect(sanitizeBalance(Number.NaN, 10000)).toBe(10000);
        expect(sanitizeBalance(Number.POSITIVE_INFINITY, 10000)).toBe(10000);
        expect(sanitizeBalance(-1, 10000)).toBe(10000);
        expect(sanitizeBalance('not-a-number', 10000)).toBe(10000);
    });

    it('clamps oversized finite balances to the JavaScript safe integer limit', () => {
        expect(sanitizeBalance(MAX_SAFE_BALANCE + 1, 10000)).toBe(MAX_SAFE_BALANCE);
        expect(sanitizeBalance(String(MAX_SAFE_BALANCE + 1000), 10000)).toBe(MAX_SAFE_BALANCE);
    });
});
