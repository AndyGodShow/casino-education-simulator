import type {
  MatchExternalIntelligenceInput,
  WorldCupCoreMetric,
  WorldCupGroup,
  WorldCupMatch,
  WorldCupTeam,
} from '../../modules/sports/football/worldCup/types';
import { teams as seededTeams } from '../../modules/sports/football/worldCup/data/teams';
import { loadFixturesWithFallback, type FixtureSource, type FixtureProvider, type FixtureProviderResult } from './fixtureProvider';
import { computeMatchStatus } from './matchStateEngine';
import type { MatchStatus } from './matchStateEngine';
import { buildDefaultAdvancedMetricProvenance } from '../../modules/sports/football/worldCup/logic/providerQualityRegistry';
import type { RawFixture, RawTeam } from './types/FootballProvider';

export type WorldCupAdapterResult = {
  matches: WorldCupMatch[];
  teams: Record<string, WorldCupTeam>;
  matchIntelligence?: Record<string, MatchExternalIntelligenceInput>;
  source: FixtureSource;
  providerName: string;
  errors: string[];
  meta: {
    totalMatches: number;
    statusBreakdown: Record<MatchStatus, number>;
  };
};

export type WorldCupAdapterOptions = {
  now?: Date;
};

const seededTeamLookup = new Map(seededTeams.map((team) => [team.id, team]));
const advancedMetricRanges = {
  elo: [0, 3000],
  recentXgFor: [0, 6],
  recentXgAgainst: [0, 6],
  squadAvailability: [0, 100],
  restDays: [0, 30],
  travelFatigue: [0, 1],
} satisfies Record<keyof NonNullable<WorldCupTeam['advancedMetrics']>, [number, number]>;

const advancedMetricFields = Object.keys(advancedMetricRanges) as Array<keyof NonNullable<WorldCupTeam['advancedMetrics']>>;
const coreMetricFields: WorldCupCoreMetric[] = ['rating', 'attack', 'defense', 'form'];

const clampMetric = (value: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const roundMetric = (value: number) => Number(value.toFixed(1));

const seedCoreMetricSources = (): NonNullable<WorldCupTeam['coreMetricSources']> =>
  Object.fromEntries(coreMetricFields.map((field) => [field, {
    source: 'seed',
    trustLevel: 'low',
    caveat: field === 'rating'
      ? 'Static pre-tournament strength prior; not a live Elo rating.'
      : 'Static pre-tournament prior used only until completed provider results are available.',
  }])) as NonNullable<WorldCupTeam['coreMetricSources']>;

const neutralTeam = (teamId: string, group?: WorldCupGroup): WorldCupTeam => ({
  id: teamId,
  name: teamId,
  shortName: teamId.slice(0, 3).toUpperCase(),
  countryCode: teamId.slice(0, 2).toUpperCase(),
  group: group ?? 'A',
  rating: 75,
  attack: 75,
  defense: 75,
  form: 75,
  coreMetricSources: seedCoreMetricSources(),
});

function normalizeGroup(group?: string | WorldCupGroup): WorldCupGroup | undefined {
  if (!group) return undefined;
  const token = group.replace(/^Group\s+/i, '').trim().toUpperCase();
  return /^[A-L]$/.test(token) ? token as WorldCupGroup : undefined;
}

function inferStage(f: RawFixture): WorldCupMatch['stage'] {
  const round = f.round?.toLowerCase() ?? '';
  if (round.includes('third')) return 'thirdPlace';
  if (round.includes('semi')) return 'semi';
  if (round.includes('quarter')) return 'quarter';
  if (round.includes('round of 16')) return 'round16';
  if (round.includes('round of 32')) return 'round32';
  if (round.includes('final')) return 'final';
  return 'group';
}

function rawString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function finiteMetric(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : undefined;
}

function sanitizeAdvancedMetrics(
  ...metricSources: Array<WorldCupTeam['advancedMetrics'] | undefined>
): WorldCupTeam['advancedMetrics'] | undefined {
  const merged = Object.assign({}, ...metricSources);
  const sanitized = Object.fromEntries(
    Object.entries(advancedMetricRanges).flatMap(([field, [min, max]]) => {
      const value = finiteMetric(merged[field as keyof typeof advancedMetricRanges], min, max);
      return typeof value === 'number' ? [[field, value]] : [];
    }),
  ) as WorldCupTeam['advancedMetrics'];

  return sanitized && Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function sanitizeAdvancedMetricSources(
  sanitizedMetrics: WorldCupTeam['advancedMetrics'] | undefined,
  seededTeam: WorldCupTeam | undefined,
  team: WorldCupTeam | RawTeam,
  source: FixtureSource,
  providerName: string,
): WorldCupTeam['advancedMetricSources'] | undefined {
  if (!sanitizedMetrics) return undefined;

  const sources = Object.fromEntries(
    advancedMetricFields.flatMap((field) => {
      if (typeof sanitizedMetrics[field] !== 'number') return [];
      const explicitSource = team.advancedMetricSources?.[field] ?? seededTeam?.advancedMetricSources?.[field];
      return [[field, explicitSource ?? buildDefaultAdvancedMetricProvenance(source, providerName)]];
    }),
  ) as WorldCupTeam['advancedMetricSources'];

  return sources && Object.keys(sources).length > 0 ? sources : undefined;
}

function mapFixture(f: RawFixture | WorldCupMatch, result: FixtureProviderResult): WorldCupMatch {
  const raw = f as RawFixture;
  const homeName = rawString(raw.homeTeam) ?? raw.home_team ?? raw.team1 ?? f.homeTeamId ?? '';
  const awayName = rawString(raw.awayTeam) ?? raw.away_team ?? raw.team2 ?? f.awayTeamId ?? '';
  const homeTeam = result.teamRegistry.resolve(homeName, result.source) ?? result.teamRegistry.resolve(homeName);
  const awayTeam = result.teamRegistry.resolve(awayName, result.source) ?? result.teamRegistry.resolve(awayName);
  const homeTeamId = homeTeam?.teamId ?? homeName;
  const awayTeamId = awayTeam?.teamId ?? awayName;
  const group = normalizeGroup(f.group);
  const [rawHomeScore, rawAwayScore] = raw.score?.ft ?? [];
  const homeScore = f.homeScore ?? (Number.isFinite(rawHomeScore) ? rawHomeScore : undefined);
  const awayScore = f.awayScore ?? (Number.isFinite(rawAwayScore) ? rawAwayScore : undefined);

  return {
    id: String(f.id),
    competitionId: f.competitionId ?? 'world-cup-2026',
    stage: f.stage ?? inferStage(f),
    group,
    homeTeamId,
    awayTeamId,
    homeTeam: {
      id: homeTeamId,
      displayName: homeTeam?.canonicalName ?? homeTeamId,
      rawName: homeTeamId,
    },
    awayTeam: {
      id: awayTeamId,
      displayName: awayTeam?.canonicalName ?? awayTeamId,
      rawName: awayTeamId,
    },
    kickoff: f.kickoff ?? raw.datetime ?? '',
    venue: f.venue ?? raw.ground,
    city: f.city ?? raw.ground,
    status: f.status ?? 'scheduled',
    homeScore,
    awayScore,
    source: f.source ?? 'openfootball',
    lastUpdated: f.lastUpdated ?? '',
    truth: f.truth,
  };
}

function enrichMatch(match: WorldCupMatch, source: FixtureSource, now: Date): WorldCupMatch {
  const hasFinalScore = typeof match.homeScore === 'number' && typeof match.awayScore === 'number';
  const status = hasFinalScore ? 'finished' : computeMatchStatus(match.kickoff, now);

  return {
    ...match,
    source: source === 'local' ? 'local' : source,
    status,
    homeTeam: {
      id: match.homeTeamId,
      displayName: match.homeTeam?.displayName ?? match.homeTeam?.rawName ?? match.homeTeamId,
      rawName: match.homeTeam?.rawName ?? match.homeTeamId,
      countryCode: match.homeTeam?.countryCode,
    },
    awayTeam: {
      id: match.awayTeamId,
      displayName: match.awayTeam?.displayName ?? match.awayTeam?.rawName ?? match.awayTeamId,
      rawName: match.awayTeam?.rawName ?? match.awayTeamId,
      countryCode: match.awayTeam?.countryCode,
    },
    lastUpdated: match.lastUpdated,
  };
}

function normalizeTeam(
  team: WorldCupTeam | RawTeam,
  source: FixtureSource,
  providerName: string,
): WorldCupTeam {
  const id = team.id.trim();
  const seededTeam = seededTeamLookup.get(id);
  const advancedMetrics = sanitizeAdvancedMetrics(seededTeam?.advancedMetrics, team.advancedMetrics);
  const advancedMetricSources = sanitizeAdvancedMetricSources(advancedMetrics, seededTeam, team, source, providerName);
  return {
    ...neutralTeam(id, normalizeGroup(team.group)),
    ...seededTeam,
    ...team,
    id,
    name: team.name ?? seededTeam?.name ?? id,
    shortName: team.shortName ?? seededTeam?.shortName ?? id.slice(0, 3).toUpperCase(),
    countryCode: team.countryCode ?? seededTeam?.countryCode ?? id.slice(0, 2).toUpperCase(),
    group: normalizeGroup(team.group) ?? seededTeam?.group ?? 'A',
    rating: team.rating ?? seededTeam?.rating ?? 75,
    attack: team.attack ?? seededTeam?.attack ?? 75,
    defense: team.defense ?? seededTeam?.defense ?? 75,
    form: team.form ?? seededTeam?.form ?? 75,
    coreMetricSources: {
      ...seedCoreMetricSources(),
      ...seededTeam?.coreMetricSources,
      ...team.coreMetricSources,
    },
    advancedMetrics,
    advancedMetricSources,
  };
}

function normalizeTeams(result: FixtureProviderResult, matches: WorldCupMatch[]): Record<string, WorldCupTeam> {
  const normalized = new Map<string, WorldCupTeam>();
  for (const team of result.teams) {
    const normalizedTeam = normalizeTeam(team, result.source, result.providerName);
    normalized.set(normalizedTeam.id, normalizedTeam);
  }

  for (const match of matches) {
    if (!normalized.has(match.homeTeamId)) {
      normalized.set(match.homeTeamId, neutralTeam(match.homeTeamId, match.group));
    }
    if (!normalized.has(match.awayTeamId)) {
      normalized.set(match.awayTeamId, neutralTeam(match.awayTeamId, match.group));
    }
  }

  return Object.fromEntries(normalized);
}

type TeamResultSample = {
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  lastUpdated: string;
};

function providerResultSamples(
  teamId: string,
  matches: WorldCupMatch[],
  evaluationTimeMs: number,
): TeamResultSample[] {
  return matches
    .filter((match) => {
      const kickoff = Date.parse(match.kickoff);
      return Number.isFinite(kickoff)
        && kickoff <= evaluationTimeMs
        && (match.homeTeamId === teamId || match.awayTeamId === teamId)
        && typeof match.homeScore === 'number'
        && typeof match.awayScore === 'number';
    })
    .sort((left, right) => Date.parse(right.kickoff) - Date.parse(left.kickoff))
    .slice(0, 5)
    .map((match) => {
      const isHome = match.homeTeamId === teamId;
      const goalsFor = isHome ? match.homeScore as number : match.awayScore as number;
      const goalsAgainst = isHome ? match.awayScore as number : match.homeScore as number;
      return {
        goalsFor,
        goalsAgainst,
        points: goalsFor > goalsAgainst ? 3 : goalsFor === goalsAgainst ? 1 : 0,
        lastUpdated: match.lastUpdated,
      };
    });
}

function newestSampleUpdate(samples: TeamResultSample[]) {
  return samples.reduce((latest, sample) => {
    const timestamp = Date.parse(sample.lastUpdated);
    const latestTimestamp = Date.parse(latest);
    return Number.isFinite(timestamp) && (!Number.isFinite(latestTimestamp) || timestamp > latestTimestamp)
      ? sample.lastUpdated
      : latest;
  }, '');
}

function enrichTeamsFromProviderResults(
  teams: Record<string, WorldCupTeam>,
  matches: WorldCupMatch[],
  providerName: string,
  evaluationTimeMs: number,
): Record<string, WorldCupTeam> {
  return Object.fromEntries(Object.entries(teams).map(([teamId, team]) => {
    const samples = providerResultSamples(teamId, matches, evaluationTimeMs);
    if (samples.length === 0) return [teamId, team];

    const goalsFor = samples.reduce((sum, sample) => sum + sample.goalsFor, 0) / samples.length;
    const goalsAgainst = samples.reduce((sum, sample) => sum + sample.goalsAgainst, 0) / samples.length;
    const pointsRate = samples.reduce((sum, sample) => sum + sample.points, 0) / (samples.length * 3);
    const resultWeight = Math.min(0.65, 0.25 + (samples.length - 1) * 0.1);
    const formWeight = Math.min(0.8, resultWeight + 0.1);
    const attackSignal = clampMetric(55 + goalsFor * 14, 35, 95);
    const defenseSignal = clampMetric(82 - goalsAgainst * 18, 35, 95);
    const formSignal = clampMetric(45 + pointsRate * 45 + (goalsFor - goalsAgainst) * 4, 25, 95);
    const lastUpdated = newestSampleUpdate(samples) || undefined;
    const provenance = {
      source: 'provider' as const,
      providerName,
      lastUpdated,
      trustLevel: samples.length >= 3 ? 'medium' as const : 'low' as const,
      caveat: `Derived from ${samples.length} completed score${samples.length === 1 ? '' : 's'}; goals are not xG and no injury data is inferred.`,
    };

    return [teamId, {
      ...team,
      attack: roundMetric(team.attack * (1 - resultWeight) + attackSignal * resultWeight),
      defense: roundMetric(team.defense * (1 - resultWeight) + defenseSignal * resultWeight),
      form: roundMetric(team.form * (1 - formWeight) + formSignal * formWeight),
      coreMetricSources: {
        ...team.coreMetricSources,
        attack: provenance,
        defense: provenance,
        form: provenance,
      },
    }];
  }));
}

export function adaptWorldCupFixtures(
  result: FixtureProviderResult,
  options: WorldCupAdapterOptions = {}
): WorldCupAdapterResult {
  const now = options.now ?? new Date();
  const normalizedMatches = result.fixtures.map((fixture) => mapFixture(fixture, result));
  const enriched = normalizedMatches.map((match) => enrichMatch(match, result.source, now));
  const normalizedTeams = normalizeTeams(result, enriched);
  const teams = result.source === 'sample' || result.source === 'local'
    ? normalizedTeams
    : enrichTeamsFromProviderResults(normalizedTeams, enriched, result.providerName, now.getTime());

  const statusBreakdown: Record<MatchStatus, number> = { scheduled: 0, live: 0, finished: 0 };
  for (const match of enriched) {
    statusBreakdown[match.status] = (statusBreakdown[match.status] ?? 0) + 1;
  }

  return {
    matches: enriched,
    teams,
    matchIntelligence: result.matchIntelligence,
    source: result.source,
    providerName: result.providerName,
    errors: result.errors,
    meta: {
      totalMatches: enriched.length,
      statusBreakdown,
    },
  };
}

export async function loadWorldCupAdapterResult(
  providers?: FixtureProvider[],
  options: WorldCupAdapterOptions = {}
): Promise<WorldCupAdapterResult> {
  const result = await loadFixturesWithFallback(providers);
  return adaptWorldCupFixtures(result, options);
}
