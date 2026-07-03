import { describe, expect, it } from 'vitest';
import { computeBaseLambdaForAlpha, computeLambda, predictMatch } from './predictionEngine';
import type { AdvancedMetricProvenance, WorldCupMatch, WorldCupTeam } from '../types';

const getPrediction = (homeId = 'france', awayId = 'jordan') => {
  const match = { ...baseMatch, id: 'test', homeTeamId: homeId, awayTeamId: awayId };
  const home = teamById[homeId];
  const away = teamById[awayId];
  return predictMatch(match, home, away);
};

const baseMatch: WorldCupMatch = {
  id: 'base',
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

const team = (id: string, rating: number, attack: number, defense: number, form: number, isHost = false): WorldCupTeam => ({
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

const source = (trustLevel: AdvancedMetricProvenance['trustLevel']): AdvancedMetricProvenance => ({
  source: 'provider',
  providerName: `${trustLevel}-trust-provider`,
  trustLevel,
  lastUpdated: '2026-06-18T00:00:00.000Z',
});

const sources = (trustLevel: AdvancedMetricProvenance['trustLevel']): WorldCupTeam['advancedMetricSources'] => ({
  elo: source(trustLevel),
  recentXgFor: source(trustLevel),
  recentXgAgainst: source(trustLevel),
  squadAvailability: source(trustLevel),
  restDays: source(trustLevel),
  travelFatigue: source(trustLevel),
});

const teamById: Record<string, WorldCupTeam> = {
  france: team('france', 90, 88, 86, 87),
  jordan: team('jordan', 68, 67, 70, 69),
  japan: team('japan', 80, 79, 78, 80),
  uruguay: team('uruguay', 84, 83, 82, 81),
};

describe('predictionEngine', () => {
  it('normalizes legal non-NaN probabilities', () => {
    const prediction = getPrediction();
    const probabilities = [prediction.probabilities.homeWin, prediction.probabilities.draw, prediction.probabilities.awayWin];
    expect(probabilities.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 4);
    probabilities.forEach((value) => {
      expect(Number.isNaN(value)).toBe(false);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    });
  });

  it('keeps upset probability alive for mismatches', () => {
    expect(getPrediction('france', 'jordan').probabilities.awayWin).toBeGreaterThan(0.03);
  });

  it('applies host boost', () => {
    const match = { ...baseMatch, id: 'host-test', homeTeamId: 'japan', awayTeamId: 'uruguay' };
    const home = teamById.japan;
    const away = teamById.uruguay;
    const hosted = predictMatch(match, { ...home, isHost: true }, away).probabilities.homeWin;
    const neutral = predictMatch(match, { ...home, isHost: false }, away).probabilities.homeWin;
    expect(hosted).toBeGreaterThan(neutral);
  });

  it('handles equal strength and missing form safely', () => {
    const match = { ...baseMatch, id: 'equal-test' };
    const home = { ...teamById.japan, rating: 80, attack: 80, defense: 80, form: Number.NaN };
    const away = { ...teamById.uruguay, rating: 80, attack: 80, defense: 80, form: 80 };
    const prediction = predictMatch(match, home, away);
    expect(prediction.probabilities.homeWin + prediction.probabilities.draw + prediction.probabilities.awayWin).toBeCloseTo(1, 4);
    expect(prediction.expectedGoals.home).toBeGreaterThan(0);
    expect(prediction.expectedGoals.away).toBeGreaterThan(0);
  });

  it('emits trust metadata and unified model probability', () => {
    const prediction = getPrediction();
    expect(prediction.truth.level).toBe('local_seed');
    expect(prediction.unifiedProbability.model.source).toBe('model');
    expect(prediction.unifiedProbability.model.home + prediction.unifiedProbability.model.draw + prediction.unifiedProbability.model.away).toBeCloseTo(1, 6);
  });

  it('emits deterministic Prediction V2 explanation output', () => {
    const first = getPrediction();
    const second = getPrediction();

    expect(first).toEqual(second);
    expect(first.modelVersion).toBe('v2');
    expect(first.scoreDistribution.length).toBeGreaterThan(0);
    expect(first.scoreDistribution[0].score).toMatch(/^\d+-\d+$/);
    expect(first.confidence).toBeGreaterThanOrEqual(0);
    expect(first.confidence).toBeLessThanOrEqual(1);
    expect(first.decisionLayer).toBeDefined();
    expect(first.decisionLayer.expectedGoals.home).toBe(first.expectedGoals.home);
    expect(first.decisionLayer.oneX2.homeWin + first.decisionLayer.oneX2.draw + first.decisionLayer.oneX2.awayWin).toBeCloseTo(1, 5);
    expect(first.featureLayer).toBeDefined();
    expect(first.featureLayer?.home.lambda).toBe(first.expectedGoals.home);
    expect(first.featureLayer?.metadata.availableAdvancedFeatures).toBe(0);
    expect(first.intelligenceLayer).toBeDefined();
    expect(first.intelligenceLayer?.coverage.missingCategories).toEqual(expect.arrayContaining([
      'squad',
      'schedule_travel',
      'market',
    ]));
    expect(first.explanation.summary).toContain('Prediction V2');
    expect(first.explanation.factors[0].name).toBe('Structured expected goals (λ)');
    expect(first.explanation.factors.length).toBeGreaterThan(4);
    expect(first.explanation.factors.map((factor) => factor.name)).toEqual(expect.arrayContaining([
      'Team strength rating gap',
      'Attack-defense matchup',
      'Data quality and freshness',
    ]));
  });

  it('shrinks team-edge lambda when sparse evidence would otherwise overstate a mismatch', () => {
    const prediction = getPrediction('france', 'jordan');
    const calibration = prediction.featureLayer?.metadata.evidenceCalibration;

    expect(calibration).toBeDefined();
    if (!calibration) throw new Error('Expected sparse-input evidence calibration');

    const originalGap = Math.abs(calibration.originalHomeLambda - calibration.originalAwayLambda);
    const calibratedGap = Math.abs(prediction.expectedGoals.home - prediction.expectedGoals.away);
    const originalTotal = calibration.originalHomeLambda + calibration.originalAwayLambda;
    const calibratedTotal = prediction.expectedGoals.home + prediction.expectedGoals.away;

    expect(prediction.featureLayer?.metadata.inputCoverage.overallRatio).toBeLessThan(0.85);
    expect(calibration.shrinkage).toBeGreaterThan(0);
    expect(calibratedGap).toBeLessThan(originalGap);
    expect(calibratedTotal).toBeCloseTo(originalTotal, 8);
  });

  it('uses calibration buckets to make low-coverage knockout coin-flips more conservative', () => {
    const match = {
      ...baseMatch,
      id: 'bucketed-calibration-test',
      stage: 'round16',
      homeTeamId: 'japan',
      awayTeamId: 'uruguay',
    } satisfies WorldCupMatch;
    const home = { ...teamById.japan, rating: 82, attack: 81, defense: 80, form: 80 };
    const away = { ...teamById.uruguay, rating: 80, attack: 80, defense: 80, form: 80 };
    const groupPrediction = predictMatch({ ...match, stage: 'group' }, home, away);
    const knockoutPrediction = predictMatch(match, home, away);

    const groupCalibration = groupPrediction.featureLayer?.metadata.evidenceCalibration;
    const knockoutCalibration = knockoutPrediction.featureLayer?.metadata.evidenceCalibration;

    expect(groupCalibration).toBeDefined();
    expect(knockoutCalibration).toBeDefined();
    if (!groupCalibration || !knockoutCalibration) throw new Error('Expected low-coverage calibration metadata');

    expect(knockoutCalibration.profile.stageBucket).toBe('knockout');
    expect(knockoutCalibration.profile.edgeBucket).toBe('close');
    expect(knockoutCalibration.profile.coverageBucket).toBe('low');
    expect(knockoutCalibration.profile.shrinkageMultiplier).toBeGreaterThan(groupCalibration.profile.shrinkageMultiplier);
    expect(knockoutCalibration.shrinkage).toBeGreaterThan(groupCalibration.shrinkage);
    expect(Math.abs(knockoutPrediction.expectedGoals.home - knockoutPrediction.expectedGoals.away))
      .toBeLessThan(Math.abs(groupPrediction.expectedGoals.home - groupPrediction.expectedGoals.away));
    expect(knockoutPrediction.probabilities.draw).toBeGreaterThan(groupPrediction.probabilities.draw);
  });

  it('lets audited strategy calibration overrides increase sparse-evidence lambda shrinkage', () => {
    const match = { ...baseMatch, id: 'strategy-override-shrinkage-test', homeTeamId: 'france', awayTeamId: 'jordan' };
    const defaultPrediction = predictMatch(match, teamById.france, teamById.jordan);
    const tunedPrediction = predictMatch(match, teamById.france, teamById.jordan, {
      strategyCalibrationOverrides: {
        shrinkageMultiplier: { lowCoverage: 1.7 },
      },
    });
    const defaultCalibration = defaultPrediction.featureLayer?.metadata.evidenceCalibration;
    const tunedCalibration = tunedPrediction.featureLayer?.metadata.evidenceCalibration;

    expect(defaultCalibration).toBeDefined();
    expect(tunedCalibration).toBeDefined();
    if (!defaultCalibration || !tunedCalibration) throw new Error('Expected sparse evidence calibration metadata');

    expect(tunedCalibration.profile.shrinkageMultiplier).toBeGreaterThan(defaultCalibration.profile.shrinkageMultiplier);
    expect(tunedCalibration.shrinkage).toBeGreaterThan(defaultCalibration.shrinkage);
    expect(Math.abs(tunedPrediction.expectedGoals.home - tunedPrediction.expectedGoals.away))
      .toBeLessThan(Math.abs(defaultPrediction.expectedGoals.home - defaultPrediction.expectedGoals.away));
  });

  it('lets audited strategy calibration overrides increase close low-tempo draw probability', () => {
    const match = {
      ...baseMatch,
      id: 'strategy-override-draw-test',
      stage: 'group',
      homeTeamId: 'japan',
      awayTeamId: 'uruguay',
    } satisfies WorldCupMatch;
    const home = { ...teamById.japan, rating: 81, attack: 79, defense: 82, form: 80 };
    const away = { ...teamById.uruguay, rating: 80, attack: 78, defense: 81, form: 80 };
    const defaultPrediction = predictMatch(match, home, away);
    const tunedPrediction = predictMatch(match, home, away, {
      strategyCalibrationOverrides: {
        drawCorrectionMultiplier: { close: 1.35, lowTempo: 1.35 },
      },
    });

    expect(defaultPrediction.featureLayer?.metadata.evidenceCalibration?.profile.edgeBucket).toBe('close');
    expect(defaultPrediction.featureLayer?.metadata.evidenceCalibration?.profile.tempoBucket).toBe('low');
    expect(tunedPrediction.featureLayer?.metadata.evidenceCalibration?.profile.drawCorrectionMultiplier)
      .toBeGreaterThan(defaultPrediction.featureLayer?.metadata.evidenceCalibration?.profile.drawCorrectionMultiplier ?? 0);
    expect(tunedPrediction.probabilities.draw).toBeGreaterThan(defaultPrediction.probabilities.draw);
  });

  it('keeps computeLambda aligned with calibrated prediction expected goals', () => {
    const match = { ...baseMatch, id: 'lambda-helper-test', homeTeamId: 'france', awayTeamId: 'jordan' };
    const prediction = predictMatch(match, teamById.france, teamById.jordan);

    expect(computeLambda(teamById.france, teamById.jordan, true, match)).toBe(prediction.expectedGoals.home);
    expect(computeLambda(teamById.jordan, teamById.france, false, match)).toBe(prediction.expectedGoals.away);
  });

  it('uses optional advanced feature inputs when they are available', () => {
    const match = { ...baseMatch, id: 'advanced-feature-test', homeTeamId: 'japan', awayTeamId: 'uruguay' };
    const neutral = predictMatch(match, teamById.japan, teamById.uruguay);
    const enriched = predictMatch(
      match,
      {
        ...teamById.japan,
        advancedMetrics: {
          elo: 1840,
          recentXgFor: 1.8,
          recentXgAgainst: 0.9,
          squadAvailability: 96,
          restDays: 6,
          travelFatigue: 0.05,
        },
        advancedMetricSources: sources('high'),
      },
      {
        ...teamById.uruguay,
        advancedMetrics: {
          elo: 1760,
          recentXgFor: 1.0,
          recentXgAgainst: 1.6,
          squadAvailability: 74,
          restDays: 3,
          travelFatigue: 0.55,
        },
        advancedMetricSources: sources('high'),
      },
    );

    expect(enriched.featureLayer?.home.advanced.total).toBeGreaterThan(0);
    expect(enriched.featureLayer?.metadata.inputCoverage.overallRatio).toBe(1);
    expect(enriched.featureLayer?.metadata.evidenceCalibration).toBeUndefined();
    expect(enriched.intelligenceLayer?.coverage.ratio).toBeGreaterThan(neutral.intelligenceLayer?.coverage.ratio ?? 0);
    expect(enriched.intelligenceLayer?.factors.find((factor) => factor.key === 'squad-availability')?.quality).toBe('provider');
    expect(enriched.expectedGoals.home).toBeGreaterThan(neutral.expectedGoals.home);
    expect(enriched.expectedGoals.away).toBeLessThan(neutral.expectedGoals.away);
    expect(enriched.probabilities.homeWin).toBeGreaterThan(neutral.probabilities.homeWin);
  });

  it('treats unsourced advanced metrics as incomplete evidence for lambda calibration', () => {
    const match = { ...baseMatch, id: 'unsourced-advanced-evidence-test', homeTeamId: 'japan', awayTeamId: 'uruguay' };
    const sourced = predictMatch(
      match,
      {
        ...teamById.japan,
        advancedMetrics: {
          elo: 1840,
          recentXgFor: 1.8,
          recentXgAgainst: 0.9,
          squadAvailability: 96,
          restDays: 6,
          travelFatigue: 0.05,
        },
        advancedMetricSources: sources('high'),
      },
      {
        ...teamById.uruguay,
        advancedMetrics: {
          elo: 1760,
          recentXgFor: 1.0,
          recentXgAgainst: 1.6,
          squadAvailability: 74,
          restDays: 3,
          travelFatigue: 0.55,
        },
        advancedMetricSources: sources('high'),
      },
    );
    const unsourced = predictMatch(
      match,
      {
        ...teamById.japan,
        advancedMetrics: {
          elo: 1840,
          recentXgFor: 1.8,
          recentXgAgainst: 0.9,
          squadAvailability: 96,
          restDays: 6,
          travelFatigue: 0.05,
        },
      },
      {
        ...teamById.uruguay,
        advancedMetrics: {
          elo: 1760,
          recentXgFor: 1.0,
          recentXgAgainst: 1.6,
          squadAvailability: 74,
          restDays: 3,
          travelFatigue: 0.55,
        },
      },
    );

    expect(sourced.featureLayer?.metadata.inputCoverage.structuralRatio).toBe(1);
    expect(sourced.featureLayer?.metadata.inputCoverage.overallRatio).toBe(1);
    expect(sourced.featureLayer?.metadata.evidenceCalibration).toBeUndefined();
    expect(unsourced.featureLayer?.metadata.inputCoverage.structuralRatio).toBe(1);
    expect(unsourced.featureLayer?.metadata.inputCoverage.advancedSourceQualityRatio).toBe(0.65);
    expect(unsourced.featureLayer?.metadata.inputCoverage.overallRatio).toBe(0.79);
    expect(unsourced.featureLayer?.metadata.evidenceCalibration?.shrinkage).toBeGreaterThan(0);
    expect(Math.abs(unsourced.expectedGoals.home - unsourced.expectedGoals.away))
      .toBeLessThan(Math.abs(sourced.expectedGoals.home - sourced.expectedGoals.away));
  });

  it('keeps alpha baseline lambda independent from match stage context', () => {
    const groupLambda = computeBaseLambdaForAlpha(
      { ...baseMatch, stage: 'group' },
      teamById.japan,
      teamById.uruguay,
    );
    const knockoutLambda = computeBaseLambdaForAlpha(
      { ...baseMatch, stage: 'quarter' },
      teamById.japan,
      teamById.uruguay,
    );

    expect(knockoutLambda).toEqual(groupLambda);
  });
});
