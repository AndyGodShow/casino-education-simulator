import { describe, expect, it } from 'vitest';
import { runWorldCupBacktest } from '../backtest';
import type { MatchDataQualityState, PredictionReliabilityState, WorldCupDomainModel } from './WorldCupDomainModel';
import type { MatchPrediction, WorldCupMatch } from '../types';
import { selectDefaultInsightMatch, selectPrediction } from './selectors';

const match = (id: string, status: WorldCupMatch['status']): WorldCupMatch => ({
  id,
  competitionId: 'world-cup-2026',
  stage: 'group',
  group: 'A',
  homeTeamId: 'mexico',
  awayTeamId: 'korea',
  kickoff: '2026-06-20T00:00:00.000Z',
  status,
  source: 'openfootball',
  lastUpdated: '2026-06-20T00:00:00.000Z',
});

const prediction = (matchId: string): MatchPrediction => ({
  matchId,
  probabilities: {
    homeWin: 0.42,
    draw: 0.28,
    awayWin: 0.3,
  },
  expectedGoals: {
    home: 1.4,
    away: 1.1,
  },
  scoreDistribution: [],
  mostLikelyScore: '1-1',
  confidence: 0.64,
  explanation: {
    summary: 'prediction',
    factors: [],
  },
  modelVersion: 'v2',
  truth: {
    level: 'live',
    confidence: 0.8,
    description: 'provider data',
    sourceBreakdown: [],
  },
  unifiedProbability: {
    matchId,
    model: {
      home: 0.42,
      draw: 0.28,
      away: 0.3,
      source: 'model',
    },
    market: undefined,
    merged: {
      home: 0.42,
      draw: 0.28,
      away: 0.3,
      source: 'ensemble',
    },
    truth: {
      level: 'live',
      confidence: 0.8,
      description: 'provider data',
      sourceBreakdown: [],
    },
  },
  decisionLayer: {
    expectedGoals: {
      home: 1.4,
      away: 1.1,
    },
    scoreDistribution: [],
    oneX2: {
      homeWin: 0.42,
      draw: 0.28,
      awayWin: 0.3,
    },
    mostLikelyScore: {
      home: 1,
      away: 1,
    },
    confidence: 0.64,
  },
});

const reliability = (matchId: string): PredictionReliabilityState => ({
  matchId,
  rawConfidence: 0.64,
  adjustedConfidence: 0.48,
  deductions: [],
  label: 'low',
  caveat: 'provider data requires official verification',
});

const quality = (matchId: string): MatchDataQualityState => ({
  matchId,
  source: 'openfootball',
  tier: 'verified_provider',
  label: 'Verified provider',
  lastUpdated: Date.parse('2026-06-20T00:00:00.000Z'),
  staleness: 'fresh',
  stalenessHours: 0,
  isOfficialFixture: false,
  isVerifiedProvider: true,
  hasVerifiedScore: false,
  canUseForRealPrediction: false,
  caveat: 'requires official verification',
});

const domainWithMatches = (matches: WorldCupMatch[]): WorldCupDomainModel => {
  const readyMatches = matches.filter((item) => item.status !== 'finished');

  return {
    matches,
    teams: {},
    predictions: Object.fromEntries(readyMatches.map((item) => [item.id, prediction(item.id)])),
    intelligence: {},
    actionGates: {},
    markets: {},
    simulation: { probabilities: [] },
    calibration: {
      status: 'no_results',
      sampleSize: 0,
      minimumSampleSize: 30,
      brierScore: null,
      logLoss: null,
      accuracy: null,
      brierReference: 2 / 3,
      calibrationError: null,
      message: 'no samples',
    },
    predictionAudit: {
      status: 'passed',
      checkedMatches: readyMatches.length,
      passedMatches: readyMatches.length,
      warningCount: 0,
      maxProbabilityDrift: 0,
      message: 'passed',
    },
    backtest: runWorldCupBacktest([]),
    backtestSamples: [],
    predictionReliability: Object.fromEntries(readyMatches.map((item) => [item.id, reliability(item.id)])),
    sourceGate: {
      tier: 'verified_provider',
      label: 'Verified provider gate',
      canUseForRealPrediction: false,
      requiresOfficialVerification: true,
      message: 'requires official verification',
    },
    matchDataQuality: Object.fromEntries(readyMatches.map((item) => [item.id, quality(item.id)])),
    source: 'openfootball',
    lastUpdated: Date.parse('2026-06-20T00:00:00.000Z'),
    errors: [],
  };
};

describe('World Cup selectors', () => {
  it('prefers the first prediction-ready non-finished match for the default insight panel', () => {
    const finished = match('finished-match', 'finished');
    const scheduled = match('scheduled-match', 'scheduled');
    const domain = domainWithMatches([finished, scheduled]);

    expect(selectDefaultInsightMatch(domain)?.id).toBe('scheduled-match');
  });

  it('falls back to the first match when no match can show prediction insight', () => {
    const finished = match('finished-match', 'finished');
    const domain = domainWithMatches([finished]);

    expect(selectDefaultInsightMatch(domain)?.id).toBe('finished-match');
  });

  it('does not expose model predictions for finished matches even when stale predictions remain in the domain', () => {
    const finished = {
      ...match('finished-match', 'finished'),
      homeScore: 2,
      awayScore: 1,
    };
    const domain = {
      ...domainWithMatches([finished]),
      predictions: {
        [finished.id]: prediction(finished.id),
      },
    };

    expect(selectPrediction(domain, finished.id)).toBeUndefined();
  });
});
