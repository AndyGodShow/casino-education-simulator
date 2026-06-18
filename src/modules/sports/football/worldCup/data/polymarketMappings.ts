import type { BetSelection } from '../types';

export type PolymarketMapping = {
  internalMatchId?: string;
  internalTeamId?: string;
  competitionId: 'world-cup-2026';
  polymarketEventSlug?: string;
  markets: {
    type: 'match_winner' | 'team_to_win' | 'draw' | 'over_under' | 'group_winner' | 'to_qualify' | 'tournament_winner';
    slug: string;
    tokenIds?: string[];
    outcomeMap?: Record<string, BetSelection | string>;
  }[];
  confidence: 'manual' | 'auto_low' | 'auto_medium' | 'auto_high';
};

export const polymarketMappings: PolymarketMapping[] = [];
