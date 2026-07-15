/**
 * Market Alignment — compares model probabilities against market implied probabilities.
 *
 * Reuses calculateNoVigProbabilities and calculateEdge from oddsEngine.ts.
 * Read-only: never modifies model output, only computes comparisons.
 */
import type { BetSelection } from '../types';
import {
  calculateEdge,
  type ThreeWayOdds,
} from '../logic/oddsEngine';
import { convertMarketProbabilities } from './marketProbability';

// ─── Types ───────────────────────────────────────────────────────────

export interface MarketAlignmentResult {
  /** Market implied probabilities (no-vig normalized) */
  marketProbs: Record<BetSelection, number>;
  /** Model probabilities */
  modelProbs: Record<BetSelection, number>;
  /** Edge = P_model - P_market for each outcome */
  edge: Record<BetSelection, number>;
  /** Sum of absolute edges — overall disagreement magnitude */
  totalDisagreement: number;
  /** Market efficiency signal */
  efficiencySignal: MarketEfficiencySignal;
  /** Does model consistently disagree with market in one direction? */
  directionConsistency: DirectionConsistency;
}

export interface MarketEfficiencySignal {
  /** 'efficient' if |edge| small, 'potential_alpha' if large */
  level: 'efficient' | 'moderate_edge' | 'potential_alpha';
  /** Average absolute edge across outcomes */
  avgAbsEdge: number;
  /** The outcome with the largest positive edge */
  strongestEdge: {
    outcome: BetSelection;
    value: number;
  };
}

interface DirectionConsistency {
  /** Does model consistently favor one outcome over market? */
  isConsistent: boolean;
  /** Which outcome the model consistently favors (if any) */
  favoredOutcome: BetSelection | 'none';
  /** Proportion of matches where model deviates from market in same direction */
  consistencyRatio: number;
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Compute model-market alignment for a single match.
 *
 * @param modelProbs — 1X2 probabilities from the prediction model
 * @param odds — decimal odds from market/bookmaker
 */
export function alignWithMarket(
  modelProbs: Record<BetSelection, number>,
  odds: ThreeWayOdds,
): MarketAlignmentResult {
  const marketProbs = convertMarketProbabilities({ kind: 'decimalOdds', ...odds });

  const edge: Record<BetSelection, number> = {
    home: calculateEdge(modelProbs.home, marketProbs.home),
    draw: calculateEdge(modelProbs.draw, marketProbs.draw),
    away: calculateEdge(modelProbs.away, marketProbs.away),
  };

  const totalDisagreement = Math.abs(edge.home) + Math.abs(edge.draw) + Math.abs(edge.away);
  const efficiencySignal = assessEfficiency(edge);
  const directionConsistency = analyzeDirection(edge);

  return {
    marketProbs,
    modelProbs,
    edge,
    totalDisagreement,
    efficiencySignal,
    directionConsistency,
  };
}

/**
 * Batch-align multiple matches and aggregate market alignment statistics.
 */
export function batchMarketAlignment(
  entries: Array<{ modelProbs: Record<BetSelection, number>; odds: ThreeWayOdds }>,
): {
  avgTotalDisagreement: number;
  avgEdge: Record<BetSelection, number>;
  efficiencyDistribution: Record<MarketEfficiencySignal['level'], number>;
  strongestMismatches: Array<{
    index: number;
    totalDisagreement: number;
    strongestOutcome: BetSelection;
  }>;
} {
  if (entries.length === 0) {
    return {
      avgTotalDisagreement: 0,
      avgEdge: { home: 0, draw: 0, away: 0 },
      efficiencyDistribution: { efficient: 0, moderate_edge: 0, potential_alpha: 0 },
      strongestMismatches: [],
    };
  }

  let sumDisagreement = 0;
  const sumEdge = { home: 0, draw: 0, away: 0 };
  const effDist: Record<MarketEfficiencySignal['level'], number> = {
    efficient: 0,
    moderate_edge: 0,
    potential_alpha: 0,
  };
  const mismatches: Array<{
    index: number;
    totalDisagreement: number;
    strongestOutcome: BetSelection;
  }> = [];

  for (let i = 0; i < entries.length; i += 1) {
    const result = alignWithMarket(entries[i].modelProbs, entries[i].odds);
    sumDisagreement += result.totalDisagreement;
    sumEdge.home += result.edge.home;
    sumEdge.draw += result.edge.draw;
    sumEdge.away += result.edge.away;
    effDist[result.efficiencySignal.level] += 1;

    mismatches.push({
      index: i,
      totalDisagreement: result.totalDisagreement,
      strongestOutcome: result.efficiencySignal.strongestEdge.outcome,
    });
  }

  const n = entries.length;
  // Top 5 strongest mismatches
  const strongestMismatches = mismatches
    .sort((a, b) => b.totalDisagreement - a.totalDisagreement)
    .slice(0, 5);

  return {
    avgTotalDisagreement: sumDisagreement / n,
    avgEdge: {
      home: sumEdge.home / n,
      draw: sumEdge.draw / n,
      away: sumEdge.away / n,
    },
    efficiencyDistribution: {
      efficient: effDist.efficient / n,
      moderate_edge: effDist.moderate_edge / n,
      potential_alpha: effDist.potential_alpha / n,
    },
    strongestMismatches,
  };
}

// ─── Internal ─────────────────────────────────────────────────────────

function assessEfficiency(edge: Record<BetSelection, number>): MarketEfficiencySignal {
  const absEdges = [
    { outcome: 'home' as BetSelection, value: Math.abs(edge.home) },
    { outcome: 'draw' as BetSelection, value: Math.abs(edge.draw) },
    { outcome: 'away' as BetSelection, value: Math.abs(edge.away) },
  ];

  const avgAbsEdge = (absEdges[0].value + absEdges[1].value + absEdges[2].value) / 3;
  const strongest = absEdges.reduce((a, b) => (a.value > b.value ? a : b));

  let level: MarketEfficiencySignal['level'];
  if (avgAbsEdge < 0.03) {
    level = 'efficient';
  } else if (avgAbsEdge < 0.08) {
    level = 'moderate_edge';
  } else {
    level = 'potential_alpha';
  }

  return {
    level,
    avgAbsEdge,
    strongestEdge: {
      outcome: strongest.outcome,
      value: edge[strongest.outcome], // signed value
    },
  };
}

function analyzeDirection(edge: Record<BetSelection, number>): DirectionConsistency {
  const signs = {
    home: Math.sign(edge.home),
    draw: Math.sign(edge.draw),
    away: Math.sign(edge.away),
  };

  // Check if one outcome has consistently the same sign as the largest magnitude
  const absEdges = [
    { outcome: 'home' as BetSelection, abs: Math.abs(edge.home), sign: signs.home },
    { outcome: 'draw' as BetSelection, abs: Math.abs(edge.draw), sign: signs.draw },
    { outcome: 'away' as BetSelection, abs: Math.abs(edge.away), sign: signs.away },
  ];

  const dominant = absEdges.reduce((a, b) => (a.abs > b.abs ? a : b));

  // Consistency for a single match is trivially true if one edge dominates
  const isConsistent = dominant.abs > 0.01;
  const favoredOutcome = isConsistent
    ? (dominant.sign > 0 ? dominant.outcome : 'none')
    : 'none';

  return {
    isConsistent,
    favoredOutcome,
    consistencyRatio: isConsistent ? 1 : 0,
  };
}
