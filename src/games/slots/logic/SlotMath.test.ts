import { describe, expect, it } from 'vitest';
import { PAYTABLE, SYMBOL_WEIGHTS } from '../types';
import type { SlotSymbol } from '../types';

const symbols = Object.keys(SYMBOL_WEIGHTS) as SlotSymbol[];
const totalWeight = Object.values(SYMBOL_WEIGHTS).reduce((sum, weight) => sum + weight, 0);

const paylinePayoutMultiplier = (lineSymbols: SlotSymbol[]): number => {
    const baseSymbol = lineSymbols.find(symbol => symbol !== 'wild') ?? 'wild';
    let count = 0;

    for (const symbol of lineSymbols) {
        if (symbol === baseSymbol || symbol === 'wild') {
            count++;
        } else {
            break;
        }
    }

    return count >= 3 ? PAYTABLE[baseSymbol][count - 3] : 0;
};

const enumerateExpectedPaylineMultiplier = (
    lineSymbols: SlotSymbol[] = [],
    probability = 1,
): number => {
    if (lineSymbols.length === 5) {
        return probability * paylinePayoutMultiplier(lineSymbols);
    }

    return symbols.reduce((sum, symbol) => (
        sum + enumerateExpectedPaylineMultiplier(
            [...lineSymbols, symbol],
            probability * (SYMBOL_WEIGHTS[symbol] / totalWeight),
        )
    ), 0);
};

describe('slot machine math', () => {
    it('documents the current theoretical RTP from symbol weights and paytable', () => {
        const theoreticalRtpPercent = enumerateExpectedPaylineMultiplier() * 100;

        expect(theoreticalRtpPercent).toBeGreaterThan(57);
        expect(theoreticalRtpPercent).toBeLessThan(59);
    });
});
