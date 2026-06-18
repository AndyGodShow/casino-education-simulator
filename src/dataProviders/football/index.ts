export { computeMatchStatus, LIVE_WINDOW_MS } from './matchStateEngine';
export type { MatchStatus } from './matchStateEngine';
export { mapExternalTeamName, getTeamDisplayName, getTeamId } from './teamMapper';
export type { MappedTeam } from './teamMapper';
export { openFootballProvider } from './openFootballProvider';
export {
  createWorldCupTeamIdentityRegistry,
  generateStableId,
  normalizeName,
  TeamIdentityRegistry,
} from './identity/teamIdentitySystem';
export type { TeamIdentity } from './identity/teamIdentitySystem';
export { resolveTeamsFromMatches } from './identity/teamResolver';
export { loadFixturesWithFallback } from './fixtureProvider';
export type { FixtureSource, FixtureProviderResult, FixtureProvider } from './fixtureProvider';
export { adaptWorldCupFixtures } from './worldCupAdapter';
export type { WorldCupAdapterResult } from './worldCupAdapter';
export type { FootballProviderStatus, FootballProviderResult } from './types';
export type { FootballProvider, RawFixture, RawTeam } from './types/FootballProvider';
