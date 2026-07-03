import { describe, expect, it } from 'vitest';
import {
  computeContextSignal,
  computeFormDeltaSignal,
  computeMatchupImpactSignal,
  computeSignalLayer,
} from './signalLayer';
import type { WorldCupMatch, WorldCupTeam } from '../types';

const team = (
  id: string,
  rating: number,
  attack: number,
  defense: number,
  form: number,
  isHost = false,
): WorldCupTeam => ({
  id,
  name: id,
  shortName: id.slice(0, 3).toUpperCase(),
  countryCode: id.slice(0, 2).toUpperCase(),
  group: 'A',
  rating,
  attack,
  defense,
  form,
  isHost,
});

const baseMatch: WorldCupMatch = {
  id: 'test',
  competitionId: 'world-cup-2026',
  stage: 'group',
  group: 'A',
  homeTeamId: 'france',
  awayTeamId: 'jordan',
  kickoff: '2026-06-18T18:00:00.000Z',
  status: 'scheduled',
  source: 'local',
  lastUpdated: '2026-06-18T00:00:00.000Z',
};

describe('signalLayer', () => {
  describe('computeFormDeltaSignal', () => {
    it('returns positive proxy value when form exceeds rating', () => {
      const signal = computeFormDeltaSignal(team('france', 85, 85, 85, 92));
      expect(signal.value).toBeGreaterThan(0);
      expect(signal.quality).toBe('proxy');
    });

    it('returns negative proxy value when form trails rating', () => {
      const signal = computeFormDeltaSignal(team('france', 85, 85, 85, 80));
      expect(signal.value).toBeLessThan(0);
    });

    it('is near zero when form equals rating', () => {
      const signal = computeFormDeltaSignal(team('france', 85, 85, 85, 85));
      expect(Math.abs(signal.value)).toBeLessThan(0.05);
    });
  });

  describe('computeMatchupImpactSignal', () => {
    it('returns positive home impact when home attack exceeds away defense', () => {
      const home = team('france', 85, 90, 88, 85);
      const away = team('jordan', 65, 62, 60, 65);
      expect(computeMatchupImpactSignal(home, away).value).toBeGreaterThan(0);
    });

    it('returns positive away impact when away attack exceeds home defense', () => {
      const home = team('france', 70, 68, 65, 70);
      const away = team('jordan', 85, 88, 90, 85);
      expect(computeMatchupImpactSignal(away, home).value).toBeGreaterThan(0);
      expect(computeMatchupImpactSignal(home, away).value).toBeLessThan(0);
    });
  });

  describe('computeContextSignal', () => {
    it('returns unavailable zero for neutral match context', () => {
      const signal = computeContextSignal(team('france', 85, 85, 85, 85), baseMatch);
      expect(signal.value).toBe(0);
      expect(signal.quality).toBe('unavailable');
    });

    it('only applies host context for explicit host team', () => {
      const host = team('france', 85, 85, 85, 85, true);
      const nonHost = team('japan', 80, 80, 80, 80, false);
      expect(computeContextSignal(host, baseMatch).value).toBeGreaterThan(0);
      expect(computeContextSignal(nonHost, baseMatch).value).toBe(0);
    });

    it('does not add knockout-stage home bias', () => {
      const t = team('france', 85, 85, 85, 85);
      const groupSignal = computeContextSignal(t, { ...baseMatch, stage: 'group' });
      const knockoutSignal = computeContextSignal(t, { ...baseMatch, stage: 'quarter' });
      expect(knockoutSignal.value).toBe(groupSignal.value);
    });
  });

  describe('computeSignalLayer', () => {
    it('returns home/away signal structure and metadata', () => {
      const result = computeSignalLayer(
        team('france', 90, 88, 86, 87),
        team('jordan', 68, 67, 70, 69),
        baseMatch,
      );

      expect(Number.isFinite(result.form.home.value)).toBe(true);
      expect(Number.isFinite(result.form.away.value)).toBe(true);
      expect(Number.isFinite(result.matchup.home.value)).toBe(true);
      expect(Number.isFinite(result.matchup.away.value)).toBe(true);
      expect(result.metadata.hasRealFormData).toBe(false);
      expect(result.metadata.hasPressureData).toBe(false);
    });
  });
});
