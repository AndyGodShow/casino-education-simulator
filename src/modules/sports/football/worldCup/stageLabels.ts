import type { WorldCupMatch } from './types';

export const worldCupStageLabels: Record<WorldCupMatch['stage'], string> = {
  group: '小组赛',
  round32: '32 强',
  round16: '16 强',
  quarter: '四分之一决赛',
  semi: '半决赛',
  thirdPlace: '季军赛',
  final: '决赛',
};

export const worldCupStageOrder: WorldCupMatch['stage'][] = [
  'group',
  'round32',
  'round16',
  'quarter',
  'semi',
  'thirdPlace',
  'final',
];
