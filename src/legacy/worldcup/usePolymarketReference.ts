import { useMemo } from 'react';
import { evaluateMarketTruth } from '../../modules/core/trustLayer/trustEvaluator';

export function usePolymarketReference(matchId?: string) {
  return useMemo(() => ({
    markets: [],
    status: 'stale' as const,
    truth: evaluateMarketTruth(null),
    message: matchId
      ? '当前样例比赛暂无可用市场参考。本模块正在使用本地样例数据。'
      : '尚未选择样例比赛。该面板保持只读，并会安全降级。',
  }), [matchId]);
}
