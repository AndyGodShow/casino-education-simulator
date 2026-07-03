import type { FootballProviderResult } from './types';

export async function loadSportMonksFixtures(): Promise<FootballProviderResult> {
  return { status: 'disabled', source: 'real', matches: [], teams: [], message: 'SportMonks adapter is disabled in this educational MVP.' };
}
