import { describe, expect, it } from 'vitest';
import { evaluateComeOutRoll, evaluatePointRoll, getDiceSum } from './CrapsEngine';

describe('CrapsEngine', () => {
    it('sums two dice', () => {
        expect(getDiceSum([3, 4])).toBe(7);
    });

    it('classifies come-out naturals', () => {
        expect(evaluateComeOutRoll([3, 4])).toEqual({ type: 'natural', sum: 7 });
        expect(evaluateComeOutRoll([5, 6])).toEqual({ type: 'natural', sum: 11 });
    });

    it('classifies come-out craps', () => {
        expect(evaluateComeOutRoll([1, 1])).toEqual({ type: 'craps', sum: 2 });
        expect(evaluateComeOutRoll([1, 2])).toEqual({ type: 'craps', sum: 3 });
        expect(evaluateComeOutRoll([6, 6])).toEqual({ type: 'craps', sum: 12 });
    });

    it('sets point on all other come-out sums', () => {
        expect(evaluateComeOutRoll([2, 2])).toEqual({ type: 'point_set', point: 4 });
        expect(evaluateComeOutRoll([4, 5])).toEqual({ type: 'point_set', point: 9 });
    });

    it('resolves point rolls', () => {
        expect(evaluatePointRoll([3, 5], 8)).toEqual({ type: 'point_hit' });
        expect(evaluatePointRoll([3, 4], 8)).toEqual({ type: 'seven_out' });
        expect(evaluatePointRoll([2, 3], 8)).toEqual({ type: 'continue' });
    });
});
