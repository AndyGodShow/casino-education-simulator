import type { WorldCupAdapterResult } from '../../../../../dataProviders/football/worldCupAdapter';
import { calibrateOutcomes } from '../calibration/outcomeCalibration';
import { calculateAccuracy, type PredictionResult } from '../logic/scoring';
import { predictMatch } from '../logic/predictionEngine';
import { calculatePredictionReliability } from '../logic/predictionReliability';
import { buildMatchAdvancedMetricTrust } from '../logic/advancedMetricTrust';
import { buildWorldCupBacktestSamplesFromParts, runWorldCupBacktest } from '../backtest';
import { actualOutcomeFromMatch } from '../logic/matchOutcome';
import { simulateManyTournaments } from '../logic/groupSimulation';
import {
  validate1X2FromScoreDist,
  validateLambdaRange,
  validateScoreDistSum,
} from '../logic/consistencyValidator';
import type {
  GroupSimulationState,
  MatchDataQualityState,
  WorldCupCalibrationState,
  WorldCupDataSourceTier,
  WorldCupDomainModel,
  WorldCupPredictionAuditState,
  WorldCupDomainSource,
  WorldCupSourceGateState,
} from './WorldCupDomainModel';
import type { MatchPrediction, WorldCupMatch } from '../types';

const MINIMUM_CALIBRATION_SAMPLE_SIZE = 30;
const PROBABILITY_TOLERANCE = 1e-6;
const STALE_LOCAL_HOURS = 1;
const STALE_SAMPLE_HOURS = 1;
const STALE_PROVIDER_HOURS = 48;

const mapDomainSource = (result: WorldCupAdapterResult): WorldCupDomainSource => {
  if (result.source === 'official') return 'official';
  if (result.source === 'local') return 'local';
  if (result.source === 'sample' || result.source === 'manual') return 'sample';
  if (result.source === 'openfootball') return 'openfootball';
  if (result.source === 'api-football') return 'api';
  if (result.source === 'sportmonks') return 'sportmonks';

  const providerName = result.providerName.toLowerCase();
  if (providerName.includes('openfootball')) return 'openfootball';
  if (providerName.includes('sportmonks')) return 'sportmonks';
  if (providerName.includes('api-football')) return 'api';
  return 'sample';
};

const sourceTierLabels: Record<WorldCupDataSourceTier, string> = {
  official: 'Official fixture',
  verified_provider: 'Verified provider',
  sample: 'Sample fixtures',
  local: 'Local seed',
};

const sourceTier = (source: WorldCupMatch['source']): WorldCupDataSourceTier => {
  if (source === 'official') return 'official';
  if (source === 'local') return 'local';
  if (source === 'sample') return 'sample';
  return 'verified_provider';
};

const matchStalenessThreshold = (tier: WorldCupDataSourceTier) => {
  if (tier === 'local') return STALE_LOCAL_HOURS;
  if (tier === 'sample') return STALE_SAMPLE_HOURS;
  return STALE_PROVIDER_HOURS;
};

const deriveStaleness = (match: WorldCupMatch, tier: WorldCupDataSourceTier) => {
  const lastUpdated = Date.parse(match.lastUpdated);
  if (!Number.isFinite(lastUpdated)) {
    return { lastUpdated: 0, staleness: 'unknown' as const, stalenessHours: null };
  }

  const kickoff = Date.parse(match.kickoff);
  const reference = Number.isFinite(kickoff) ? Math.max(kickoff, lastUpdated) : lastUpdated;
  const stalenessHours = Math.max(0, (reference - lastUpdated) / 3_600_000);
  const staleness = stalenessHours > matchStalenessThreshold(tier) ? 'stale' as const : 'fresh' as const;

  return { lastUpdated, staleness, stalenessHours };
};

const buildMatchDataQuality = (matches: WorldCupMatch[]): Record<string, MatchDataQualityState> => Object.fromEntries(
  matches.map((match) => {
    const tier = sourceTier(match.source);
    const staleness = deriveStaleness(match, tier);
    const isOfficialFixture = tier === 'official';
    const isVerifiedProvider = tier === 'official' || tier === 'verified_provider';
    const hasVerifiedScore = isVerifiedProvider
      && match.status === 'finished'
      && typeof match.homeScore === 'number'
      && typeof match.awayScore === 'number';
    const canUseForRealPrediction = isOfficialFixture && staleness.staleness === 'fresh';
    const caveat = tier === 'official'
      ? '官方赛程口径；仍需结合结果校准，不代表投注建议。'
      : tier === 'verified_provider'
        ? '第三方 provider 数据已进入模型，但仍需官方赛程核验。'
        : tier === 'sample'
          ? '样例数据仅用于教育演示，不应用作真实赛事预测。'
          : '本地 seed 仅用于教育演示，不应用作真实赛事预测。';

    return [match.id, {
      matchId: match.id,
      source: match.source,
      tier,
      label: sourceTierLabels[tier],
      lastUpdated: staleness.lastUpdated,
      staleness: staleness.staleness,
      stalenessHours: staleness.stalenessHours,
      isOfficialFixture,
      isVerifiedProvider,
      hasVerifiedScore,
      canUseForRealPrediction,
      caveat,
    }];
  }),
);

const sourceGateFromQuality = (
  source: WorldCupDomainSource,
  matchDataQuality: Record<string, MatchDataQualityState>,
): WorldCupSourceGateState => {
  const qualities = Object.values(matchDataQuality);
  const hasOfficial = qualities.some((quality) => quality.tier === 'official');
  const hasVerifiedProvider = qualities.some((quality) => quality.tier === 'verified_provider');
  const canUseForRealPrediction = qualities.length > 0
    && qualities.every((quality) => quality.canUseForRealPrediction);

  if (hasOfficial && canUseForRealPrediction) {
    return {
      tier: 'official',
      label: 'Official fixture gate',
      canUseForRealPrediction: true,
      requiresOfficialVerification: false,
      message: '当前赛程通过官方口径门禁；预测仍需结果校准，不构成投注建议。',
    };
  }

  if (hasVerifiedProvider || source === 'api' || source === 'openfootball' || source === 'sportmonks') {
    return {
      tier: 'verified_provider',
      label: 'Verified provider gate',
      canUseForRealPrediction: false,
      requiresOfficialVerification: true,
      message: '第三方 provider 数据可用于模型估计，但仍需官方赛程核验，不能标记为真实赛事预测。',
    };
  }

  if (source === 'sample') {
    return {
      tier: 'sample',
      label: 'Sample data gate',
      canUseForRealPrediction: false,
      requiresOfficialVerification: true,
      message: '样例赛程只允许教育演示口径，不能进入真实赛事预测。',
    };
  }

  return {
    tier: 'local',
    label: 'Local seed gate',
    canUseForRealPrediction: false,
    requiresOfficialVerification: true,
    message: '本地 seed 只允许教育演示口径，不能进入真实赛事预测。',
  };
};

const buildSimulation = (adapterResult: WorldCupAdapterResult): GroupSimulationState => ({
  probabilities: simulateManyTournaments({
    iterations: 1000,
    truthLevelWeighting: true,
    matches: adapterResult.matches,
    teams: adapterResult.teams,
  }),
});

const deriveLastUpdated = (adapterResult: WorldCupAdapterResult) => {
  const latestMatchUpdate = adapterResult.matches.reduce((latest, match) => {
    const timestamp = Date.parse(match.lastUpdated);
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);

  return latestMatchUpdate || 0;
};

const buildCalibration = (
  matches: WorldCupMatch[],
  predictions: Record<string, MatchPrediction>,
): WorldCupCalibrationState => {
  const results = matches.flatMap((match): PredictionResult[] => {
    const outcome = actualOutcomeFromMatch(match);
    const prediction = predictions[match.id];
    if (!outcome || !prediction) return [];

    return [{
      probabilities: {
        home: prediction.probabilities.homeWin,
        draw: prediction.probabilities.draw,
        away: prediction.probabilities.awayWin,
      },
      outcome,
    }];
  });

  const outcomeCalibration = calibrateOutcomes(results);
  const sampleSize = outcomeCalibration.sampleSize;
  const hasResults = sampleSize > 0;
  const status = !hasResults
    ? 'no_results'
    : sampleSize < MINIMUM_CALIBRATION_SAMPLE_SIZE
      ? 'insufficient_sample'
      : 'ready';

  const message = status === 'ready'
    ? `已有 ${sampleSize} 场带真实比分的比赛，可用于初步校准。`
    : status === 'insufficient_sample'
      ? `只有 ${sampleSize} 场带真实比分的比赛，样本不足，不能证明模型准确。`
      : '暂无带真实比分的完赛样本，模型尚未经过结果回测。';

  return {
    status,
    sampleSize,
    minimumSampleSize: MINIMUM_CALIBRATION_SAMPLE_SIZE,
    brierScore: hasResults ? outcomeCalibration.brierScore : null,
    logLoss: hasResults ? outcomeCalibration.logLoss : null,
    accuracy: hasResults ? calculateAccuracy(results) : null,
    brierReference: outcomeCalibration.brierReference,
    calibrationError: hasResults ? outcomeCalibration.overconfidence.calibrationError : null,
    message,
  };
};

const probabilityDrift = (actual: number, expected: number) => Math.abs(actual - expected);

const auditPrediction = (prediction: MatchPrediction) => {
  const warnings: string[] = [];
  const decisionLayer = prediction.decisionLayer;
  const probabilitySum = prediction.probabilities.homeWin
    + prediction.probabilities.draw
    + prediction.probabilities.awayWin;

  warnings.push(...validateLambdaRange(decisionLayer.expectedGoals.home, 'home').warnings);
  warnings.push(...validateLambdaRange(decisionLayer.expectedGoals.away, 'away').warnings);
  warnings.push(...validateScoreDistSum(decisionLayer.scoreDistribution).warnings);
  warnings.push(...validate1X2FromScoreDist(decisionLayer.scoreDistribution, decisionLayer.oneX2).warnings);

  if (Math.abs(probabilitySum - 1) > PROBABILITY_TOLERANCE) {
    warnings.push(`Top-level 1X2 sum=${probabilitySum.toFixed(8)} deviates from 1.0`);
  }

  const drifts = [
    probabilityDrift(prediction.probabilities.homeWin, decisionLayer.oneX2.homeWin),
    probabilityDrift(prediction.probabilities.draw, decisionLayer.oneX2.draw),
    probabilityDrift(prediction.probabilities.awayWin, decisionLayer.oneX2.awayWin),
  ];
  const maxProbabilityDrift = Math.max(...drifts);

  if (maxProbabilityDrift > PROBABILITY_TOLERANCE) {
    warnings.push(`Top-level probabilities drift from decision layer by ${maxProbabilityDrift.toFixed(8)}`);
  }

  if (!Number.isFinite(prediction.confidence) || prediction.confidence < 0 || prediction.confidence > 1) {
    warnings.push(`Confidence=${prediction.confidence.toFixed(8)} outside [0, 1]`);
  }

  return {
    valid: warnings.length === 0,
    warnings,
    maxProbabilityDrift,
  };
};

const buildPredictionAudit = (predictions: Record<string, MatchPrediction>): WorldCupPredictionAuditState => {
  const audits = Object.values(predictions).map(auditPrediction);

  if (audits.length === 0) {
    return {
      status: 'warning',
      checkedMatches: 0,
      passedMatches: 0,
      warningCount: 1,
      maxProbabilityDrift: 0,
      message: '暂无可自检的预测样本，需等待赛程进入 Domain Model。',
    };
  }

  const passedMatches = audits.filter((audit) => audit.valid).length;
  const warningCount = audits.reduce((sum, audit) => sum + audit.warnings.length, 0);
  const maxProbabilityDrift = Math.max(...audits.map((audit) => audit.maxProbabilityDrift));
  const status = warningCount === 0
    ? 'passed'
    : passedMatches === 0
      ? 'failed'
      : 'warning';

  const message = status === 'passed'
    ? `已自检 ${audits.length} 场预测：λ、比分分布、胜平负概率和顶层展示一致。`
    : status === 'warning'
      ? `已自检 ${audits.length} 场预测，其中 ${audits.length - passedMatches} 场存在推导警告。`
      : `已自检 ${audits.length} 场预测，当前推导链条未通过一致性检查。`;

  return {
    status,
    checkedMatches: audits.length,
    passedMatches,
    warningCount,
    maxProbabilityDrift,
    message,
  };
};

export function buildWorldCupDomain(adapterResult: WorldCupAdapterResult): WorldCupDomainModel {
  const predictions = Object.fromEntries(
    adapterResult.matches.flatMap((match) => {
      const homeTeam = adapterResult.teams[match.homeTeamId];
      const awayTeam = adapterResult.teams[match.awayTeamId];
      return homeTeam && awayTeam ? [[match.id, predictMatch(match, homeTeam, awayTeam)]] : [];
    }),
  );
  const markets = Object.fromEntries(adapterResult.matches.map((match) => [match.id, null]));
  const calibration = buildCalibration(adapterResult.matches, predictions);
  const predictionAudit = buildPredictionAudit(predictions);
  const matchDataQuality = buildMatchDataQuality(adapterResult.matches);
  const matchesById = Object.fromEntries(adapterResult.matches.map((match) => [match.id, match]));
  const predictionReliability = Object.fromEntries(
    Object.values(predictions).flatMap((prediction) => {
      const quality = matchDataQuality[prediction.matchId];
      const match = matchesById[prediction.matchId];
      if (!quality) return [];
      const homeTeam = match ? adapterResult.teams[match.homeTeamId] : null;
      const awayTeam = match ? adapterResult.teams[match.awayTeamId] : null;
      const advancedMetricTrust = homeTeam && awayTeam
        ? buildMatchAdvancedMetricTrust(homeTeam, awayTeam, quality.lastUpdated)
        : undefined;

      return [[prediction.matchId, calculatePredictionReliability({
        matchId: prediction.matchId,
        rawConfidence: prediction.confidence,
        inputCoverage: prediction.featureLayer?.metadata.inputCoverage,
        advancedMetricTrust,
        matchDataQuality: quality,
        calibration,
        predictionAudit,
      })]];
    }),
  );
  const backtest = runWorldCupBacktest(buildWorldCupBacktestSamplesFromParts({
    matches: adapterResult.matches,
    predictions,
    matchDataQuality,
    predictionReliability,
  }));
  const source = mapDomainSource(adapterResult);
  const sourceGate = sourceGateFromQuality(source, matchDataQuality);

  return {
    matches: adapterResult.matches,
    teams: adapterResult.teams,
    predictions,
    markets,
    simulation: buildSimulation(adapterResult),
    calibration,
    predictionAudit,
    backtest,
    predictionReliability,
    sourceGate,
    matchDataQuality,
    source,
    lastUpdated: deriveLastUpdated(adapterResult),
    errors: adapterResult.errors,
  };
}
