import { describe, expect, it } from 'vitest';
import { computeMatchStatus, LIVE_WINDOW_MS } from './matchStateEngine';

describe('matchStateEngine', () => {
  it('returns scheduled when kickoff is in the future', () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    expect(computeMatchStatus(future)).toBe('scheduled');
  });

  it('returns live when match is in progress', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(computeMatchStatus(fiveMinAgo)).toBe('live');
  });

  it('returns finished when match ended', () => {
    const threeHoursAgo = new Date(Date.now() - LIVE_WINDOW_MS - 60_000).toISOString();
    expect(computeMatchStatus(threeHoursAgo)).toBe('finished');
  });

  it('accepts a custom now date for deterministic testing', () => {
    const kickoff = '2026-06-18T18:00:00.000Z';
    const beforeMatch = new Date('2026-06-18T17:59:00.000Z');
    const duringMatch = new Date('2026-06-18T19:30:00.000Z');
    const afterMatch = new Date('2026-06-18T21:00:00.000Z');

    expect(computeMatchStatus(kickoff, beforeMatch)).toBe('scheduled');
    expect(computeMatchStatus(kickoff, duringMatch)).toBe('live');
    expect(computeMatchStatus(kickoff, afterMatch)).toBe('finished');
  });

  it('returns scheduled for invalid date strings', () => {
    expect(computeMatchStatus('not-a-date')).toBe('scheduled');
  });
});
