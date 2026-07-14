import { describe, expect, it } from 'vitest';
import { shouldPreloadOptionalGames } from './preloadPolicy';

describe('shouldPreloadOptionalGames', () => {
  it.each(['main', 'sports', 'football', 'worldCup', 'game'])(
    'does not preload traditional games on the %s screen',
    (screenType) => {
      expect(shouldPreloadOptionalGames({ screenType })).toBe(false);
    },
  );

  it('allows optional preload in the traditional lobby on an unrestricted connection', () => {
    expect(
      shouldPreloadOptionalGames({
        screenType: 'traditional',
        saveData: false,
        effectiveType: '4g',
      }),
    ).toBe(true);
  });

  it('allows optional preload when connection information is unavailable', () => {
    expect(shouldPreloadOptionalGames({ screenType: 'traditional' })).toBe(true);
  });

  it.each([
    { saveData: true, effectiveType: '4g' },
    { saveData: false, effectiveType: 'slow-2g' },
    { saveData: false, effectiveType: '2g' },
  ])('blocks optional preload for constrained networking: %o', (connection) => {
    expect(
      shouldPreloadOptionalGames({ screenType: 'traditional', ...connection }),
    ).toBe(false);
  });
});
