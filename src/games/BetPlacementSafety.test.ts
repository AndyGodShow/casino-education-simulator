// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    canStartBaccaratRound,
    commitBaccaratBet,
    useBaccaratGame,
} from './baccarat/hooks/useBaccaratGame';
import {
    canSpinRoulette,
    commitRouletteBet,
    useRouletteGame,
} from './roulette/hooks/useRouletteGame';
import { RoulettePhase, type RouletteBet } from './roulette/types';
import * as debitCommit from './logic/commitDebitedBet';

afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
});

describe('bet placement safety guards', () => {
    it('commits a baccarat bet only after a successful debit', () => {
        const committedBets: Array<{ type: string; amount: number }> = [];
        const rejectedDebit = vi.fn((amount: number) => (
            Number.isFinite(amount) && amount > 0 && amount <= 50
        ));
        const rejectedCommit = vi.fn((type: string, amount: number) => {
            committedBets.push({ type, amount });
        });

        expect(commitBaccaratBet('PLAYER', Number.NaN, rejectedDebit, rejectedCommit)).toBe(false);
        expect(commitBaccaratBet('PLAYER', 100, rejectedDebit, rejectedCommit)).toBe(false);
        expect(rejectedDebit).toHaveBeenNthCalledWith(1, Number.NaN);
        expect(rejectedDebit).toHaveBeenNthCalledWith(2, 100);
        expect(rejectedCommit).not.toHaveBeenCalled();
        expect(committedBets).toEqual([]);

        const acceptedDebit = vi.fn(() => true);
        const acceptedCommit = vi.fn((type: string, amount: number) => {
            committedBets.push({ type, amount });
        });
        expect(commitBaccaratBet('BANKER', 250, acceptedDebit, acceptedCommit)).toBe(true);
        expect(acceptedDebit).toHaveBeenCalledExactlyOnceWith(250);
        expect(acceptedCommit).toHaveBeenCalledExactlyOnceWith('BANKER', 250);
        expect(committedBets).toEqual([{ type: 'BANKER', amount: 250 }]);
    });

    it('commits a roulette bet only after a successful debit', () => {
        const committedBets: RouletteBet[] = [];
        const rejectedDebit = vi.fn((amount: number) => (
            Number.isFinite(amount) && amount > 0 && amount <= 50
        ));
        const rejectedCommit = vi.fn((bet: RouletteBet) => {
            committedBets.push(bet);
        });

        expect(commitRouletteBet('straight', 0, 17, rejectedDebit, rejectedCommit)).toBe(false);
        expect(commitRouletteBet('straight', 100, 17, rejectedDebit, rejectedCommit)).toBe(false);
        expect(rejectedDebit).toHaveBeenNthCalledWith(1, 0);
        expect(rejectedDebit).toHaveBeenNthCalledWith(2, 100);
        expect(rejectedCommit).not.toHaveBeenCalled();
        expect(committedBets).toEqual([]);

        const acceptedDebit = vi.fn(() => true);
        const acceptedCommit = vi.fn((bet: RouletteBet) => {
            committedBets.push(bet);
        });
        expect(commitRouletteBet('street', 50, 4, acceptedDebit, acceptedCommit)).toBe(true);
        expect(acceptedDebit).toHaveBeenCalledExactlyOnceWith(50);
        expect(acceptedCommit).toHaveBeenCalledExactlyOnceWith({ type: 'street', amount: 50, value: 4 });
        expect(committedBets).toEqual([{ type: 'street', amount: 50, value: 4 }]);
    });

    it('keeps an empty baccarat round from mutating settlement state', () => {
        const randomResult = vi.fn();
        const creditPayout = vi.fn();
        const mutatePhase = vi.fn();

        const attemptSettlement = (currentBet: number, bets: Record<string, number | undefined>) => {
            if (!canStartBaccaratRound(currentBet, bets)) return false;
            randomResult();
            creditPayout();
            mutatePhase();
            return true;
        };

        expect(attemptSettlement(0, {})).toBe(false);
        expect(attemptSettlement(0, { PLAYER: 0 })).toBe(false);
        expect(randomResult).not.toHaveBeenCalled();
        expect(creditPayout).not.toHaveBeenCalled();
        expect(mutatePhase).not.toHaveBeenCalled();
    });

    it('keeps empty and zero-stake roulette rounds from spinning or settling', () => {
        const randomResult = vi.fn();
        const creditPayout = vi.fn();
        const mutatePhase = vi.fn();
        const attemptSettlement = (bets: RouletteBet[]) => {
            if (!canSpinRoulette(RoulettePhase.Betting, bets)) return false;
            randomResult();
            creditPayout();
            mutatePhase();
            return true;
        };

        expect(attemptSettlement([])).toBe(false);
        expect(attemptSettlement([{ type: 'red', amount: 0 }])).toBe(false);
        expect(canSpinRoulette(RoulettePhase.Spinning, [{ type: 'red', amount: 10 }])).toBe(false);
        expect(randomResult).not.toHaveBeenCalled();
        expect(creditPayout).not.toHaveBeenCalled();
        expect(mutatePhase).not.toHaveBeenCalled();
    });

    it('wires baccarat hook placement and empty settlement through production guards', async () => {
        const commitSpy = vi.spyOn(debitCommit, 'commitDebitedBet');
        const { result } = renderHook(() => useBaccaratGame());

        act(() => result.current.placeBet('PLAYER', 20_000));
        expect(commitSpy).toHaveBeenCalledTimes(1);
        expect(result.current.playerState.currentBet).toBe(0);
        expect(result.current.playerState.bets).toEqual({});
        expect(result.current.playerState.balance).toBe(10_000);

        act(() => result.current.placeBet('PLAYER', 100));
        expect(commitSpy).toHaveBeenCalledTimes(2);
        expect(result.current.playerState.currentBet).toBe(100);
        expect(result.current.playerState.bets).toEqual({ PLAYER: 100 });
        expect(result.current.playerState.balance).toBe(9_900);

        act(() => result.current.clearBet());
        await act(async () => {
            await result.current.startGame();
        });
        expect(result.current.gameState.phase).toBe('BETTING');
        expect(result.current.gameState.history).toEqual([]);
        expect(result.current.playerState.balance).toBe(10_000);
    });

    it('wires roulette hook placement and empty spin through production guards', () => {
        const commitSpy = vi.spyOn(debitCommit, 'commitDebitedBet');
        const { result } = renderHook(() => useRouletteGame());

        act(() => result.current.placeBet('straight', 20_000, 17));
        expect(commitSpy).toHaveBeenCalledTimes(1);
        expect(result.current.gameState.bets).toEqual([]);
        expect(result.current.balance).toBe(10_000);

        act(() => result.current.placeBet('straight', 100, 17));
        expect(commitSpy).toHaveBeenCalledTimes(2);
        expect(result.current.gameState.bets).toEqual([{ type: 'straight', amount: 100, value: 17 }]);
        expect(result.current.balance).toBe(9_900);

        act(() => result.current.clearBets());
        act(() => result.current.spin());
        expect(result.current.gameState.phase).toBe(RoulettePhase.Betting);
        expect(result.current.gameState.history).toEqual([]);
        expect(result.current.spinResult).toBeNull();
        expect(result.current.balance).toBe(10_000);
    });
});
