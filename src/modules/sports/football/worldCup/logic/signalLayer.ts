import type { WorldCupMatch, WorldCupTeam } from '../types';

const safeRating = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);

export type AlphaSignalQuality = 'proxy' | 'real' | 'unavailable';

export interface AlphaSignal {
  value: number;
  quality: AlphaSignalQuality;
  explanation: string;
}

export interface AlphaSignals {
  form: {
    home: AlphaSignal;
    away: AlphaSignal;
  };
  matchup: {
    home: AlphaSignal;
    away: AlphaSignal;
  };
  context: {
    home: AlphaSignal;
    away: AlphaSignal;
  };
  metadata: {
    hasRealFormData: boolean;
    hasVenueHostData: boolean;
    hasPressureData: boolean;
  };
}

/**
 * Proxy form delta signal. This is not true recent match form unless the
 * source data is backed by actual recent results; current seeded team form is
 * treated as a proxy deviation from baseline rating.
 */
export function computeFormDeltaSignal(team: WorldCupTeam): AlphaSignal {
  const rating = safeRating(team.rating, 75);
  const form = safeRating(team.form, rating);
  const value = Math.tanh((form - rating) / 12) * 0.5;

  return {
    value,
    quality: 'proxy',
    explanation: 'Form is modeled as seeded form-rating deviation; not real recent-match form.',
  };
}

/**
 * Compute team-specific attack-vs-defense impact. Positive values increase
 * that team's λ; away impact is computed independently instead of sign-flipped.
 */
export function computeMatchupImpactSignal(team: WorldCupTeam, opponent: WorldCupTeam): AlphaSignal {
  const teamRating = safeRating(team.rating, 75);
  const opponentRating = safeRating(opponent.rating, 75);
  const attack = safeRating(team.attack, teamRating);
  const opponentDefense = safeRating(opponent.defense, opponentRating);
  const value = Math.tanh((attack - opponentDefense) / 20) * 0.5;

  return {
    value,
    quality: 'proxy',
    explanation: 'Matchup compares this team attack rating against opponent defense rating.',
  };
}

/**
 * Context only enters λ when explicit host-team information is available.
 * Stage and pressure data are metadata until a variance/pressure model exists.
 */
export function computeContextSignal(team: WorldCupTeam, match: WorldCupMatch): AlphaSignal {
  const venueHostTeamId = (match as WorldCupMatch & { venueHostTeamId?: string }).venueHostTeamId;
  const hasExplicitVenueHost = venueHostTeamId === team.id;
  const hasHostFlag = team.isHost === true;

  if (!hasExplicitVenueHost && !hasHostFlag) {
    return {
      value: 0,
      quality: 'unavailable',
      explanation: 'No explicit host or venue-host signal available; context does not affect λ.',
    };
  }

  return {
    value: Math.tanh(0.25) * 0.4,
    quality: 'proxy',
    explanation: 'Host advantage is applied only for an explicit host team signal.',
  };
}

/**
 * Compute all three signal components for a match.
 */
export function computeSignalLayer(
  homeTeam: WorldCupTeam,
  awayTeam: WorldCupTeam,
  match: WorldCupMatch,
): AlphaSignals {
  const homeContext = computeContextSignal(homeTeam, match);
  const awayContext = computeContextSignal(awayTeam, match);

  return {
    form: {
      home: computeFormDeltaSignal(homeTeam),
      away: computeFormDeltaSignal(awayTeam),
    },
    matchup: {
      home: computeMatchupImpactSignal(homeTeam, awayTeam),
      away: computeMatchupImpactSignal(awayTeam, homeTeam),
    },
    context: {
      home: homeContext,
      away: awayContext,
    },
    metadata: {
      hasRealFormData: false,
      hasVenueHostData: homeContext.value !== 0 || awayContext.value !== 0,
      hasPressureData: false,
    },
  };
}

export const computeSignals = computeSignalLayer;
