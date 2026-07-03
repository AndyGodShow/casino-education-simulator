import { describe, expect, it } from 'vitest';
import { generateStableId, normalizeName, TeamIdentityRegistry } from './teamIdentitySystem';
import { resolveTeamsFromMatches } from './teamResolver';

describe('TeamIdentitySystem', () => {
  it('resolves canonical names, aliases, and provider source names', () => {
    const registry = new TeamIdentityRegistry();
    registry.register({
      teamId: 'usa',
      canonicalName: 'United States',
      aliases: ['USA'],
      country: 'United States',
      sourceMap: { openfootball: 'United States' },
    });

    expect(registry.resolve('United States')?.teamId).toBe('usa');
    expect(registry.resolve('USA')?.teamId).toBe('usa');
    expect(registry.resolve('United States', 'openfootball')?.teamId).toBe('usa');
  });

  it('normalizes provider names into stable World Cup team ids', () => {
    const registry = resolveTeamsFromMatches([
      { id: '1', homeTeam: 'United States', awayTeam: 'Korea Republic' },
      { id: '2', homeTeam: 'USA', awayTeam: 'South Korea' },
    ]);

    expect(registry.resolve('United States')?.teamId).toBe('usa');
    expect(registry.resolve('USA')?.teamId).toBe('usa');
    expect(registry.resolve('Korea Republic')?.teamId).toBe('south-korea');
    expect(registry.resolve('South Korea')?.teamId).toBe('south-korea');
  });

  it('falls back to slug ids for unknown teams', () => {
    expect(normalizeName('  Mars   Colony FC  ')).toBe('Mars Colony FC');
    expect(generateStableId('Mars Colony FC')).toBe('mars-colony-fc');

    const registry = resolveTeamsFromMatches([{ id: '1', homeTeam: 'Mars Colony FC', awayTeam: 'Brazil' }]);
    expect(registry.resolve('Mars Colony FC')?.teamId).toBe('mars-colony-fc');
  });
});
