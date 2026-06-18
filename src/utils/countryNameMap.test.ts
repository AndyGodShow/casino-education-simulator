import { describe, expect, it } from 'vitest';
import { getCountryDisplayName } from './countryNameMap';

describe('countryNameMap', () => {
  it('covers current OpenFootball 2026 qualified team names', () => {
    const names = [
      'Austria',
      'Bosnia & Herzegovina',
      'Cape Verde',
      'Curaçao',
      'Czech Republic',
      'DR Congo',
      'Haiti',
      'Norway',
      'Scotland',
      'Sweden',
      'USA',
    ];

    for (const name of names) {
      expect(getCountryDisplayName(name)).not.toBe(name);
    }
  });

  it('leaves knockout placeholders untouched', () => {
    expect(getCountryDisplayName('W100')).toBe('W100');
    expect(getCountryDisplayName('1A')).toBe('1A');
  });
});
