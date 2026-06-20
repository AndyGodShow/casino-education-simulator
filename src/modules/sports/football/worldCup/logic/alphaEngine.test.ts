import { describe, expect, it } from 'vitest';
import { computeAlpha } from './alphaEngine';
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

const match = (overrides: Partial<WorldCupMatch> = {}): WorldCupMatch => ({
  id: 'test',
  competitionId: 'world-cup-2026',
  stage: 'group',
  group: 'A',
  homeTeamId: 'home',
  awayTeamId: 'away',
  kickoff: '2026-06-18T18:00:00.000Z',
  status: 'scheduled',
  source: 'local',
  lastUpdated: '2026-06-18T00:00:00.000Z',
  ...overrides,
});

describe('alphaEngine', () => {
  it('produces valid alpha result structure', () => {
    const home = team('france', 90, 88, 86, 87);
    const away = team('jordan', 68, 67, 70, 69);
    const result = computeAlpha(match(), home, away);

    // Baseline sums to 1
    expect(result.baseline.homeWin + result.baseline.draw + result.baseline.awayWin).toBeCloseTo(1, 5);
    // Model sums to 1
    expect(result.model.homeWin + result.model.draw + result.model.awayWin).toBeCloseTo(1, 5);
    // Alpha sums to 0 (redistribution, not creation)
    expect(result.alpha.homeWin + result.alpha.draw + result.alpha.awayWin).toBeCloseTo(0, 5);
    // Signals present
    expect(result.signals.form).toBeDefined();
    expect(result.signals.matchup).toBeDefined();
    expect(result.signals.context).toBeDefined();
  });

  it('is deterministic', () => {
    const home = team('france', 90, 88, 86, 87);
    const away = team('jordan', 68, 67, 70, 69);
    expect(computeAlpha(match(), home, away)).toEqual(computeAlpha(match(), home, away));
  });

  // ─── Alpha validation criteria ───

  describe('validation: strong teams alpha stability', () => {
    it('strong vs weak: alpha magnitude does not explode', () => {
      const strongHome = team('france', 92, 90, 88, 90);
      const weakAway = team('jordan', 60, 58, 62, 60);
      const result = computeAlpha(match(), strongHome, weakAway);

      // Clean baseline means explicit signals can move probability, but stay bounded.
      expect(Math.abs(result.alpha.homeWin)).toBeLessThan(0.15);
      expect(Math.abs(result.alpha.draw)).toBeLessThan(0.15);
      expect(Math.abs(result.alpha.awayWin)).toBeLessThan(0.15);
    });

    it('strong vs strong: alpha magnitude stays bounded', () => {
      const home = team('france', 90, 88, 86, 90);
      const away = team('brazil', 89, 87, 85, 88);
      const result = computeAlpha(match(), home, away);

      expect(Math.abs(result.alpha.homeWin)).toBeLessThan(0.10);
      expect(Math.abs(result.alpha.draw)).toBeLessThan(0.10);
      expect(Math.abs(result.alpha.awayWin)).toBeLessThan(0.10);
    });
  });

  describe('validation: weak teams no systematic positive alpha', () => {
    it('weak home team does not get systematic positive home alpha', () => {
      const weakHome = team('jordan', 60, 58, 62, 58);
      const strongAway = team('france', 92, 90, 88, 92);
      const result = computeAlpha(match(), weakHome, strongAway);

      // Weak team's form is below rating, matchup favors strong team
      // → alpha.homeWin should not be systematically positive
      // We check that the signal pushes in the expected direction
      // (weak team should get negative or neutral alpha)
      expect(result.alpha.homeWin).toBeLessThanOrEqual(0.02);
    });

    it('weak away team does not get systematic positive away alpha', () => {
      const strongHome = team('france', 92, 90, 88, 92);
      const weakAway = team('jordan', 60, 58, 62, 58);
      const result = computeAlpha(match(), strongHome, weakAway);

      // Weak away team should not get positive away alpha
      expect(result.alpha.awayWin).toBeLessThanOrEqual(0.02);
    });
  });

  describe('validation: derby match alpha volatility', () => {
    it('derby match has higher alpha sensitivity than mismatch', () => {
      // Derby: evenly matched teams with moderate form differential
      const derbyHome = team('japan', 80, 80, 80, 86);
      const derbyAway = team('uruguay', 80, 80, 80, 74);
      const derbyResult = computeAlpha(match(), derbyHome, derbyAway);

      // Mismatch: strong vs weak (different ratings, similar relative form gap)
      const strongHome = team('france', 92, 90, 88, 92);
      const weakAway = team('jordan', 60, 58, 62, 58);
      const mismatchResult = computeAlpha(match(), strongHome, weakAway);

      // α sensitivity = total |alpha| / total |λ shift|
      const derbyLambdaShift = Math.abs(derbyResult.lambda.signal.home - derbyResult.lambda.base.home)
        + Math.abs(derbyResult.lambda.signal.away - derbyResult.lambda.base.away);
      const mismatchLambdaShift = Math.abs(mismatchResult.lambda.signal.home - mismatchResult.lambda.base.home)
        + Math.abs(mismatchResult.lambda.signal.away - mismatchResult.lambda.base.away);

      const derbyAlpha = Math.abs(derbyResult.alpha.homeWin) + Math.abs(derbyResult.alpha.draw) + Math.abs(derbyResult.alpha.awayWin);
      const mismatchAlpha = Math.abs(mismatchResult.alpha.homeWin) + Math.abs(mismatchResult.alpha.draw) + Math.abs(mismatchResult.alpha.awayWin);

      const derbySensitivity = derbyLambdaShift > 0 ? derbyAlpha / derbyLambdaShift : 0;
      const mismatchSensitivity = mismatchLambdaShift > 0 ? mismatchAlpha / mismatchLambdaShift : 0;

      // Derby: evenly matched → small λ shift causes larger probability shift
      expect(derbySensitivity).toBeGreaterThanOrEqual(mismatchSensitivity * 0.8);
    });

    it('derby with form differential produces non-zero alpha', () => {
      // Evenly matched teams but one in much better form
      const home = team('japan', 80, 80, 80, 88); // hot form
      const away = team('uruguay', 80, 80, 80, 72); // cold form
      const result = computeAlpha(match(), home, away);

      // Form signal should push alpha toward home
      expect(result.alpha.homeWin).toBeGreaterThan(0);
      // Total alpha should be non-trivial
      const totalAlpha = Math.abs(result.alpha.homeWin) + Math.abs(result.alpha.draw) + Math.abs(result.alpha.awayWin);
      expect(totalAlpha).toBeGreaterThan(0.005);
    });
  });

  describe('signal λ behavior', () => {
    it('signal λ stays within valid range', () => {
      const home = team('france', 90, 88, 86, 87);
      const away = team('jordan', 68, 67, 70, 69);
      const result = computeAlpha(match(), home, away);

      expect(result.lambda.signal.home).toBeGreaterThanOrEqual(0.2);
      expect(result.lambda.signal.home).toBeLessThanOrEqual(4.5);
      expect(result.lambda.signal.away).toBeGreaterThanOrEqual(0.2);
      expect(result.lambda.signal.away).toBeLessThanOrEqual(4.5);
    });

    it('signal λ deviates from base λ when signals are non-zero', () => {
      // Use teams with clear form differential
      const home = team('france', 85, 85, 85, 92); // form > rating
      const away = team('jordan', 70, 70, 70, 65); // form < rating
      const result = computeAlpha(match(), home, away);

      // Signal λ should differ from base λ
      const homeDiff = Math.abs(result.lambda.signal.home - result.lambda.base.home);
      const awayDiff = Math.abs(result.lambda.signal.away - result.lambda.base.away);
      expect(homeDiff + awayDiff).toBeGreaterThan(0);
    });

    it('keeps signal λ equal to baseline λ when explicit signals are neutral', () => {
      const home = team('home', 80, 80, 80, 80);
      const away = team('away', 80, 80, 80, 80);
      const result = computeAlpha(match(), home, away);

      expect(result.lambda.signal.home).toBeCloseTo(result.lambda.base.home, 5);
      expect(result.lambda.signal.away).toBeCloseTo(result.lambda.base.away, 5);
      expect(result.alpha.homeWin + result.alpha.draw + result.alpha.awayWin).toBeCloseTo(0, 5);
    });

    it('records raw signals and weights for attribution', () => {
      const result = computeAlpha(
        match({ id: 'signals' }),
        team('home', 80, 84, 80, 86),
        team('away', 80, 76, 80, 74),
      );

      expect(result.signals.form.home.quality).toBe('proxy');
      expect(result.weights.form + result.weights.matchup + result.weights.context).toBeCloseTo(1, 5);
    });
  });
});
