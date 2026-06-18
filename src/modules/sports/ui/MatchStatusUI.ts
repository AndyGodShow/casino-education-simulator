export const MatchStatusUI = {
  SCHEDULED: 'scheduled',
  LIVE: 'live',
  FINISHED: 'finished',
} as const;

export type MatchStatusUI = (typeof MatchStatusUI)[keyof typeof MatchStatusUI];

export const matchStatusLabel: Record<MatchStatusUI, string> = {
  scheduled: '未开始',
  live: '进行中',
  finished: '已结束',
};
