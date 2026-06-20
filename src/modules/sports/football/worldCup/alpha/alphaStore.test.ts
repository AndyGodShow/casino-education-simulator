import { describe, expect, it, beforeEach } from 'vitest';
import { createAlphaStore, record, resolve, getAll, getResolved, getByMatchId, count, countResolved, reset } from './alphaStore';
import type { AlphaRecord } from './alphaStore';

const makeRecord = (matchId: string): Omit<AlphaRecord, 'createdAt'> => ({
  matchId,
  alphaHomeWin: 0.03,
  alphaDraw: -0.01,
  alphaAwayWin: -0.02,
  predictedOutcome: 'home',
});

describe('alphaStore', () => {
  beforeEach(() => reset());

  it('records and retrieves entries', () => {
    record(makeRecord('match-1'));
    expect(count()).toBe(1);
    expect(getAll()).toHaveLength(1);
  });

  it('deduplicates by matchId', () => {
    record(makeRecord('match-1'));
    record({ ...makeRecord('match-1'), alphaHomeWin: 0.05 });
    expect(count()).toBe(1);
    expect(getAll()[0].alphaHomeWin).toBe(0.05);
  });

  it('resolves match outcomes from scores', () => {
    record(makeRecord('match-1'));
    resolve('match-1', 2, 0); // home win
    const entry = getByMatchId('match-1');
    expect(entry?.actualOutcome).toBe('home');
    expect(entry?.resolvedAt).toBeDefined();
  });

  it('resolves draw correctly', () => {
    record(makeRecord('match-2'));
    resolve('match-2', 1, 1);
    expect(getByMatchId('match-2')?.actualOutcome).toBe('draw');
  });

  it('resolves away win correctly', () => {
    record(makeRecord('match-3'));
    resolve('match-3', 0, 2);
    expect(getByMatchId('match-3')?.actualOutcome).toBe('away');
  });

  it('getResolved returns only finished matches', () => {
    record(makeRecord('match-1'));
    record(makeRecord('match-2'));
    resolve('match-1', 2, 1);
    expect(countResolved()).toBe(1);
    expect(getResolved()).toHaveLength(1);
    expect(getResolved()[0].matchId).toBe('match-1');
  });

  it('resolve is no-op for unknown match', () => {
    expect(() => resolve('unknown', 1, 0)).not.toThrow();
  });

  it('reset clears all data', () => {
    record(makeRecord('match-1'));
    resolve('match-1', 2, 0);
    reset();
    expect(count()).toBe(0);
    expect(countResolved()).toBe(0);
  });

  it('getByMatchId returns undefined for missing match', () => {
    expect(getByMatchId('nonexistent')).toBeUndefined();
  });

  it('factory store enforces maxRecords by dropping oldest records', () => {
    const store = createAlphaStore({ maxRecords: 2 });
    store.append(makeRecord('oldest'));
    store.append(makeRecord('middle'));
    store.append(makeRecord('newest'));

    expect(store.size()).toBe(2);
    expect(store.getByMatchId('oldest')).toBeUndefined();
    expect(store.getByMatchId('middle')).toBeDefined();
    expect(store.getByMatchId('newest')).toBeDefined();
  });
});
