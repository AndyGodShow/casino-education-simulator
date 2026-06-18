import type { FootballProviderResult } from './types';

export async function loadOpenFootballFixtures(): Promise<FootballProviderResult> {
  return { status: 'disabled', source: 'real', matches: [], teams: [], message: 'OpenFootball adapter is scaffolded; no live feed is configured.' };
}
