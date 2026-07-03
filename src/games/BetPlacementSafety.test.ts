import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const expectDebitBeforeMutation = (
    source: string,
    debitGuard: string,
    mutationCall: string,
) => {
    const debitIndex = source.indexOf(debitGuard);
    const mutationIndex = source.indexOf(mutationCall);

    expect(debitIndex).toBeGreaterThanOrEqual(0);
    expect(mutationIndex).toBeGreaterThanOrEqual(0);
    expect(debitIndex).toBeLessThan(mutationIndex);
};

describe('bet placement safety guards', () => {
    it('keeps baccarat card bets behind debit success and prevents settlement without a bet', () => {
        const source = readSource('src/games/baccarat/hooks/useBaccaratGame.ts');

        expectDebitBeforeMutation(source, 'if (!debitBalance(amount)) return;', 'setPlayerState((prev) => {');
        expect(source).toContain('if (playerState.currentBet === 0) return;');
    });

    it('keeps roulette non-card bets behind debit success and prevents settlement without a bet', () => {
        const source = readSource('src/games/roulette/hooks/useRouletteGame.ts');

        expectDebitBeforeMutation(source, 'if (!debitBalance(amount)) return;', 'setGameState(prev => ({');
        expect(source).toContain('if (gameState.phase !== RoulettePhase.Betting || gameState.bets.length === 0) return;');
    });
});
