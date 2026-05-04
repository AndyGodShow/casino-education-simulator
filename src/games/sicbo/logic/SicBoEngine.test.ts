import { describe, expect, it } from 'vitest';
import type { DiceResult } from '../types';
import { calculatePayout, getDiceSum } from './SicBoEngine';

describe('SicBoEngine', () => {
    it('sums three dice', () => {
        expect(getDiceSum([1, 2, 3])).toBe(6);
    });

    it('settles big, small, odd, and even bets while excluding triples', () => {
        expect(calculatePayout({ type: 'big', amount: 100 }, [4, 5, 6])).toBe(200);
        expect(calculatePayout({ type: 'small', amount: 100 }, [1, 2, 3])).toBe(200);
        expect(calculatePayout({ type: 'odd', amount: 100 }, [2, 3, 4])).toBe(200);
        expect(calculatePayout({ type: 'even', amount: 100 }, [2, 4, 6])).toBe(200);

        const triple: DiceResult = [5, 5, 5];
        expect(calculatePayout({ type: 'big', amount: 100 }, triple)).toBe(0);
        expect(calculatePayout({ type: 'odd', amount: 100 }, triple)).toBe(0);
    });

    it('settles triple and double bets', () => {
        expect(calculatePayout({ type: 'specific_triple', amount: 10, value: 3 }, [3, 3, 3])).toBe(1810);
        expect(calculatePayout({ type: 'specific_triple', amount: 10, value: 2 }, [3, 3, 3])).toBe(0);
        expect(calculatePayout({ type: 'any_triple', amount: 10 }, [4, 4, 4])).toBe(310);
        expect(calculatePayout({ type: 'specific_double', amount: 10, value: 6 }, [6, 6, 2])).toBe(110);
    });

    it('settles two-dice combo, total, and single-number bets', () => {
        expect(calculatePayout({ type: 'two_dice_combo', amount: 10, value: 25 }, [2, 5, 6])).toBe(60);
        expect(calculatePayout({ type: 'total', amount: 10, value: 10 }, [2, 3, 5])).toBe(70);
        expect(calculatePayout({ type: 'single', amount: 10, value: 4 }, [4, 2, 6])).toBe(20);
        expect(calculatePayout({ type: 'single', amount: 10, value: 4 }, [4, 4, 6])).toBe(30);
        expect(calculatePayout({ type: 'single', amount: 10, value: 4 }, [4, 4, 4])).toBe(130);
    });
});
