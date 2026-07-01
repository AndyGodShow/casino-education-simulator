import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MatchCard } from './MatchCard';
import type { MatchPrediction, WorldCupMatch } from '../types';

const baseMatch: WorldCupMatch = {
  id: 'match-1',
  competitionId: 'world-cup-2026',
  stage: 'group',
  group: 'A',
  homeTeamId: 'canada',
  awayTeamId: 'mexico',
  kickoff: '2026-06-12T00:00:00.000Z',
  status: 'scheduled',
  source: 'sample',
  lastUpdated: '2026-06-01T00:00:00.000Z',
};

const prediction: MatchPrediction = {
  matchId: 'match-1',
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
    summary: 'sample prediction',
    factors: [],
  },
  modelVersion: 'v2',
  truth: {
    level: 'sample',
    confidence: 0.4,
    description: 'sample',
    sourceBreakdown: [],
  },
  unifiedProbability: {
    model: {
      home: 0.42,
      draw: 0.28,
      away: 0.3,
    },
    market: {
      home: 0.51,
      draw: 0.24,
      away: 0.25,
    },
    merged: {
      home: 0.46,
      draw: 0.26,
      away: 0.28,
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
};

describe('WorldCup MatchCard', () => {
  it('renders only the final score summary for finished matches', () => {
    const html = renderToStaticMarkup(
      <MatchCard
        match={{ ...baseMatch, status: 'finished', homeScore: 2, awayScore: 1 }}
        getTeamName={(teamId) => ({ canada: '加拿大', mexico: '墨西哥' })[teamId] ?? teamId}
        prediction={prediction}
      />,
    );

    expect(html).toContain('加拿大 vs 墨西哥');
    expect(html).toContain('比分');
    expect(html).toContain('2 - 1');
    expect(html).toContain('暂无赛前预测');
    expect(html).not.toContain('模型倾向');
    expect(html).not.toContain('市场参考');
    expect(html).not.toContain('样例数据');
  });

  it('shows the locked pre-match result beside a finished score', () => {
    const html = renderToStaticMarkup(
      <MatchCard
        match={{ ...baseMatch, status: 'finished', homeScore: 2, awayScore: 1 }}
        getTeamName={(teamId) => ({ canada: '加拿大', mexico: '墨西哥' })[teamId] ?? teamId}
        snapshot={{
          matchId: baseMatch.id,
          homeTeamId: baseMatch.homeTeamId,
          awayTeamId: baseMatch.awayTeamId,
          kickoff: baseMatch.kickoff,
          capturedAt: '2026-06-11T23:59:00.000Z',
          prediction,
        }}
      />,
    );

    expect(html).toContain('赛前预测：加拿大胜');
    expect(html).toContain('2 - 1');
  });

  it('keeps probability summaries for scheduled matches', () => {
    const html = renderToStaticMarkup(
      <MatchCard
        match={baseMatch}
        getTeamName={(teamId) => ({ canada: '加拿大', mexico: '墨西哥' })[teamId] ?? teamId}
        prediction={prediction}
      />,
    );

    expect(html).toContain('模型倾向');
    expect(html).toContain('市场参考');
    expect(html).toContain('42.0%');
    expect(html).toContain('51.0%');
  });

  it('labels knockout stages instead of showing an empty group', () => {
    const html = renderToStaticMarkup(
      <MatchCard
        match={{ ...baseMatch, stage: 'round32', group: undefined }}
        getTeamName={(teamId) => teamId}
      />,
    );

    expect(html).toContain('32 强');
    expect(html).not.toContain('小组 -');
  });
});
