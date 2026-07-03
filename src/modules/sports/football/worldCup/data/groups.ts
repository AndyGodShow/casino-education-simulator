import type { WorldCupGroup } from '../types';
import { teams } from './teams';

export const groups: WorldCupGroup[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

export const groupTeams = Object.fromEntries(
  groups.map((group) => [group, teams.filter((team) => team.group === group).map((team) => team.id)]),
) as Record<WorldCupGroup, string[]>;
