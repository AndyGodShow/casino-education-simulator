import { describe, expect, it } from 'vitest';
import { runSlotSimulation } from './SlotSimulationEngine';
import type { SlotStrategy } from './SlotStrategies';

const fixedStrategy: SlotStrategy = {
    name: 'test fixed',
    description: 'test strategy',
    getNextBet: (_balance, baseBet) => baseBet,
};

describe('slot simulation input guards', () => {
    it('normalizes direct engine inputs before entering the simulation loop', () => {
        const result = runSlotSimulation({
            rounds: Number.POSITIVE_INFINITY,
            initialBalance: 100,
            baseBetPerLine: Number.NaN,
            activeLines: Number.POSITIVE_INFINITY,
            strategy: fixedStrategy,
        });

        expect(result.rounds).toBe(0);
        expect(result.initialBalance).toBe(100);
        expect(result.finalBalance).toBe(100);
        expect(result.totalWagered).toBe(0);
    });
});
