import { describe, expect, it } from 'vitest';
import { getSecureRandomFloat, getSecureRandomInt, pickRandom } from './Random';

describe('secure random helpers', () => {
    it('keeps integer and float outputs inside documented ranges', () => {
        for (let i = 0; i < 100; i++) {
            const intValue = getSecureRandomInt(37);
            expect(intValue).toBeGreaterThanOrEqual(0);
            expect(intValue).toBeLessThan(37);

            const floatValue = getSecureRandomFloat();
            expect(floatValue).toBeGreaterThanOrEqual(0);
            expect(floatValue).toBeLessThan(1);
        }
    });

    it('picks only values from the supplied collection', () => {
        const values = ['dragon', 'tiger', 'tie'] as const;

        for (let i = 0; i < 50; i++) {
            expect(values).toContain(pickRandom(values));
        }
    });
});
