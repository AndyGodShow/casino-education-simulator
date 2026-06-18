import type { WorldCupMatch, WorldCupTeam } from '../../modules/sports/football/worldCup/types';
import type { RawFixture, RawTeam } from './types/FootballProvider';

export type FootballProviderStatus = 'available' | 'disabled' | 'failed';

export type FootballProviderResult = {
  status: FootballProviderStatus;
  source: WorldCupMatch['source'];
  matches: Array<WorldCupMatch | RawFixture>;
  teams: Array<WorldCupTeam | RawTeam>;
  message: string;
};
