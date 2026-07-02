import { describe, expect, it } from 'vitest';
import type { CausalTeamRating } from './causalTeamRatings';
import {
  MAX_PUBLIC_STRATEGY_TEAM_RATINGS,
  projectStrategyTeamRatings,
} from './strategyTeamRatings';

const rating = (
  team: string,
  overrides: Partial<CausalTeamRating> = {},
): CausalTeamRating => ({
  team,
  asOf: '2026-07-02T12:00:00.000Z',
  matches: 20,
  elo: 1_650,
  rating: 84,
  form: 78,
  attack: 79,
  defense: 77,
  evidenceWeight: 4.2,
  lastMatchDate: '2026-06-20',
  provenance: {
    source: 'martj42-international-results',
    method: 'time-causal-elo-and-recency',
    trustLevel: 'medium',
  },
  ...overrides,
});

describe('projectStrategyTeamRatings', () => {
  it('maps historical aliases to stable World Cup team ids', () => {
    const projected = projectStrategyTeamRatings({
      'United States': rating('United States', { elo: 1_702 }),
      'Korea Republic': rating('Korea Republic', { elo: 1_611 }),
      Austria: rating('Austria', { elo: 1_680 }),
    });

    expect(projected.usa).toMatchObject({
      teamId: 'usa',
      teamName: 'United States',
      elo: 1_702,
      trustLevel: 'medium',
    });
    expect(projected['south-korea']?.teamId).toBe('south-korea');
    expect(projected.austria?.teamId).toBe('austria');
  });

  it('keeps the strongest current alias and rejects unusable evidence', () => {
    const projected = projectStrategyTeamRatings({
      USA: rating('USA', {
        elo: 1_620,
        evidenceWeight: 2,
        lastMatchDate: '2026-05-01',
      }),
      'United States': rating('United States', {
        elo: 1_710,
        evidenceWeight: 5,
        lastMatchDate: '2026-06-20',
      }),
      Unknown: rating('Unknown', {
        matches: 0,
        evidenceWeight: 0,
        lastMatchDate: null,
      }),
    });

    expect(projected.usa?.elo).toBe(1_710);
    expect(projected.unknown).toBeUndefined();
  });

  it('bounds and orders the public rating snapshot deterministically', () => {
    const input = Object.fromEntries(Array.from(
      { length: MAX_PUBLIC_STRATEGY_TEAM_RATINGS + 20 },
      (_, index) => {
        const team = `Team ${String(index).padStart(3, '0')}`;
        return [team, rating(team, {
          elo: 1_500 + index,
          lastMatchDate: `2026-06-${String(1 + (index % 28)).padStart(2, '0')}`,
        })];
      },
    ));

    const first = projectStrategyTeamRatings(input);
    const second = projectStrategyTeamRatings(Object.fromEntries(Object.entries(input).reverse()));

    expect(Object.keys(first)).toHaveLength(MAX_PUBLIC_STRATEGY_TEAM_RATINGS);
    expect(second).toEqual(first);
    expect(Object.keys(first)).toEqual([...Object.keys(first)].sort());
  });
});
