import { describe, expect, it } from 'vitest';
import { isUnresolvedTeamPlaceholder } from './teamPlaceholders';

describe('teamPlaceholders', () => {
  it.each([
    '1a',
    '3a-b-c-d-f',
    '2a-2b',
    'w49',
    'winner-match-49',
  ])('detects unresolved placeholder team id %s', (teamId) => {
    expect(isUnresolvedTeamPlaceholder(teamId)).toBe(true);
  });

  it.each([
    'usa',
    'south-korea',
    'ivory-coast',
  ])('keeps real team id %s eligible for predictions', (teamId) => {
    expect(isUnresolvedTeamPlaceholder(teamId)).toBe(false);
  });
});
