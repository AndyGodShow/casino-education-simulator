import { describe, expect, it } from 'vitest';
import { getDicePips } from './dicePips';

describe('dice pip patterns', () => {
    it('renders only visible pips for standard six-sided dice faces', () => {
        expect(getDicePips(1)).toEqual([{ row: 1, col: 1 }]);
        expect(getDicePips(6)).toEqual([
            { row: 0, col: 0 },
            { row: 0, col: 2 },
            { row: 1, col: 0 },
            { row: 1, col: 2 },
            { row: 2, col: 0 },
            { row: 2, col: 2 },
        ]);
        expect(getDicePips(6)).toHaveLength(6);
    });

    it('does not create placeholder pips for invalid values', () => {
        expect(getDicePips(0)).toEqual([]);
        expect(getDicePips(9)).toEqual([]);
    });
});
