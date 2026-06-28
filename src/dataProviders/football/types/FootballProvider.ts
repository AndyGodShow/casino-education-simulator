import type {
  DataTrustInfo,
} from '../../../modules/core/trustLayer/dataTruth';
import type {
  MatchExternalIntelligenceInput,
  WorldCupGroup,
  WorldCupMatch,
  WorldCupMatchTeam,
  WorldCupTeam,
} from '../../../modules/sports/football/worldCup/types';

export type RawFixture = Partial<Omit<WorldCupMatch, 'id' | 'homeTeam' | 'awayTeam' | 'group'>> & {
  id: string;
  homeTeam?: string | WorldCupMatchTeam;
  awayTeam?: string | WorldCupMatchTeam;
  home_team?: string;
  away_team?: string;
  datetime?: string;
  date?: string;
  time?: string;
  team1?: string;
  team2?: string;
  group?: WorldCupGroup | string;
  ground?: string;
  num?: number;
  round?: string;
  score?: {
    ft?: number[];
  };
  truth?: DataTrustInfo;
};

export type RawTeam = Partial<WorldCupTeam> & {
  id: string;
  name: string;
  country?: string;
};

export interface FootballProvider {
  name: string;
  status: 'active' | 'disabled' | 'fallback';
  fetchFixtures(): Promise<RawFixture[]>;
  fetchTeams(): Promise<RawTeam[]>;
  fetchMatchIntelligence?(): Promise<Record<string, MatchExternalIntelligenceInput>>;
}
