import type { FootballProviderResult } from './types';

export async function loadApiFootballFixtures(): Promise<FootballProviderResult> {
  return { status: 'disabled', source: 'real', matches: [], teams: [], message: 'API-Football adapter is disabled in this educational MVP.' };
}
