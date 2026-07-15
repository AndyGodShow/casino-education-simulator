import { spawnSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';

const REMOVED_EXPORT_SURFACE: Record<string, string[]> = {
  'src/games/baccarat/logic/Strategies.ts': [
    'MartingaleStrategy', 'AlwaysTieStrategy', 'RandomStrategy', 'MartingaleRandomStrategy',
  ],
  'src/games/blackjack/logic/BlackjackStrategies.ts': [
    'ParoliBasicStrategy', 'ConservativeStandStrategy', 'AggressiveDoubleStrategy',
    'FlatDealerWeakStrategy', 'LossLimitBasicStrategy', 'MartingaleBasicStrategy',
    'DealerMimicStrategy',
  ],
  'src/games/roulette/logic/RouletteStrategies.ts': [
    'FlatOutsideStrategy', 'MartingaleRedStrategy', 'DAlembertRedStrategy',
    'ParoliRedStrategy', 'DozenRotationStrategy', 'ColumnSpreadStrategy',
    'StraightNumberStrategy', 'RandomOutsideStrategy',
  ],
  'src/utils/countryNameMap.ts': ['countryNameMap', 'uiVocabularyMap'],
  'src/utils/dicePips.ts': ['DICE_PIP_PATTERNS'],
  'src/modules/sports/football/worldCup/logic/oddsEngine.ts': ['normalizeBookProbabilities'],
  'src/modules/core/trustLayer/dataTruth.ts': [
    'TRUTH_LEVEL_LABELS', 'TRUTH_LEVEL_CONFIDENCE', 'clampConfidence',
  ],
  'src/modules/sports/football/worldCup/alpha/alphaEvaluator.ts': [
    'computeSignalAttribution', 'BucketResult', 'CalibrationDrift', 'SignalAttribution',
  ],
  'src/modules/sports/football/worldCup/alpha/alphaStore.ts': [
    'MAX_ALPHA_RECORDS', 'defaultAlphaStore', 'OneX2Probability',
  ],
  'src/modules/sports/football/worldCup/logic/signalLayer.ts': [
    'computeSignalLayer', 'computeSignals', 'AlphaSignalQuality',
  ],
  'src/modules/sports/football/worldCup/logic/alphaEngine.ts': ['applyAlphaSignalsToLambda'],
  'src/modules/sports/football/worldCup/logic/scoreDistribution.ts': ['applyDrawMassCorrection'],
  'src/modules/sports/football/worldCup/logic/consistencyValidator.ts': ['validateBehavioralConstraints'],
  'src/modules/sports/football/worldCup/data/educationalOdds.ts': ['educationalOdds'],
  'src/dataProviders/polymarket/adapters.ts': ['marketQualityScore', 'calculateMarketQuality'],
  'src/dataProviders/football/fixtureProvider.ts': ['WorldCupProviderOutput'],
  'src/dataProviders/football/types.ts': ['FootballProviderStatus'],
  'src/modules/sports/football/worldCup/data/publicWorldCupSnapshot.ts': ['PublicWorldCupAdapterResult'],
  'src/modules/sports/football/worldCup/types.ts': [
    'IntelligenceFactorSide', 'MatchIntelligenceCoverage', 'PredictionRiskBand',
    'MatchAdvancedFeatureContribution',
  ],
  'src/modules/sports/football/worldCup/domain/WorldCupDomainModel.ts': [
    'MatchViewModel', 'TeamViewModel', 'MatchDataStaleness',
  ],
  'src/components/Common/Simulation/stats.ts': ['BatchTestMethodId'],
  'src/modules/core/probability/unifiedProbability.ts': ['ProbabilitySource'],
  'src/modules/sports/football/worldCup/backtest/types.ts': [
    'WorldCupBacktestPredictionOrigin', 'WorldCupBacktestStageBucket',
    'WorldCupBacktestEdgeBucket', 'WorldCupBacktestTempoBucket', 'WorldCupBacktestCoverageBucket',
  ],
  'src/modules/sports/football/worldCup/backtest/worldCupBacktest.ts': [
    'WorldCupBacktestBucket', 'WorldCupBacktestCalibrationReadiness', 'WorldCupBacktestMetrics',
    'WorldCupBacktestSourceTier', 'WorldCupConfidenceBacktestBucket',
  ],
  'src/modules/sports/football/worldCup/backtest/combinedAuditSummary.ts': [
    'WorldCupCombinedCalibrationEvidenceStatus',
  ],
  'src/modules/sports/football/worldCup/backtest/historicalBacktest.ts': [
    'HistoricalBacktestRejectionReason', 'HistoricalBacktestAudit',
    'HistoricalBacktestCsvRejectionReason', 'HistoricalBacktestCsvAudit',
  ],
  'src/modules/sports/football/worldCup/logic/modelConfig.ts': [
    'WorldCupEvidenceShrinkageMultiplierKey', 'WorldCupEvidenceDrawCorrectionMultiplierKey',
  ],
  'src/modules/sports/football/worldCup/backtest/strategyTuning.ts': [
    'WorldCupStrategyTuningParameter', 'WorldCupStrategyTuningDirection',
    'WorldCupStrategyTuningRecommendation', 'WorldCupStrategyTuningPatchChange',
  ],
  'src/modules/sports/football/worldCup/calibration/alphaPersistence.ts': ['SignalStabilityRanking'],
  'src/modules/sports/football/worldCup/calibration/calibrationSummary.ts': ['CalibrationGrade'],
  'src/modules/sports/football/worldCup/calibration/marketAlignment.ts': ['DirectionConsistency'],
  'src/modules/sports/football/worldCup/calibration/outcomeCalibration.ts': [
    'CalibrationCurveBucket', 'OverconfidenceReport',
  ],
  'src/modules/sports/football/worldCup/logic/bookmakerEngine.ts': ['BookmakerExposure'],
  'src/modules/sports/football/worldCup/logic/groupMotivation.ts': ['TeamMotivationState'],
  'src/modules/sports/football/worldCup/logic/poissonModel.ts': ['ScoreProbability'],
  'src/modules/sports/football/worldCup/logic/providerQualityRegistry.ts': [
    'FootballProviderFieldCoverage',
  ],
  'src/modules/sports/football/worldCup/research/internationalResults.ts': [
    'InternationalResultsRejectionReason',
  ],
  'src/modules/sports/football/worldCup/research/walkForwardOptimizer.ts': [
    'StrategyEvaluationMetrics',
  ],
  'src/games/craps/types.ts': ['CrapsRoundStatus'],
  'src/components/SimulationPanel/index.ts': ['SimulationPanelProps', 'StatBoxProps'],
  'src/games/blackjack/types.ts': ['BlackjackHand', 'BlackjackRoundResult'],
  'src/components/SimulationPanel/SimulationPanel.tsx': [
    'StrategyOption', 'RunParams', 'ExtraControlsCtx',
  ],
  'src/modules/sports/football/worldCup/backtest/index.ts': [
    'runCombinedWorldCupBacktest', 'buildWorldCupStrategyCalibrationOverrides',
    'recommendWorldCupStrategyTuning', 'buildHistoricalBacktestDataset',
    'parseHistoricalBacktestCsv', 'runHistoricalWorldCupBacktest',
    'LOCAL_SAMPLE_HISTORICAL_BACKTEST_CSV', 'buildStrategyScenarioContext',
    'optimizeWorldCupStrategy', 'predictStrategyCandidate',
    'strategyOptimizationSamplesFromTimeline', 'WorldCupBacktestBucket',
    'WorldCupBacktestCalibrationReadiness', 'WorldCupBacktestCalibrationUsabilityStatus',
    'WorldCupBacktestMetrics', 'WorldCupBacktestQuality', 'WorldCupBacktestScenarioBuckets',
    'WorldCupBacktestScenarioProfile', 'WorldCupBacktestStageCoverage',
    'WorldCupBacktestSourceCoverage', 'WorldCupBacktestSourceTier',
    'WorldCupCombinedBacktestAudit', 'WorldCupCombinedBacktestOriginAudit',
    'WorldCupCombinedBacktestRun', 'WorldCupCombinedCalibrationAudit',
    'WorldCupConfidenceBacktestBucket', 'CombinedWorldCupBacktestInput',
    'WorldCupBacktestQualitySummary', 'WorldCupCombinedCalibrationEvidenceStatus',
    'WorldCupCombinedCalibrationSummary', 'CombinedWorldCupCalibrationRun',
    'WorldCupStrategyTuningDirection', 'WorldCupStrategyTuningPatch',
    'WorldCupStrategyTuningPatchChange', 'WorldCupStrategyTuningParameter',
    'WorldCupStrategyTuningRecommendation', 'WorldCupStrategyTuningReport',
    'HistoricalBacktestAudit', 'HistoricalBacktestCsvAudit', 'HistoricalBacktestCsvParse',
    'HistoricalBacktestCsvRejectionReason', 'HistoricalBacktestDataset',
    'HistoricalBacktestImportSummary', 'HistoricalBacktestRejectionReason',
    'HistoricalBacktestRow', 'StrategyCandidate', 'StrategyEvaluationMetrics',
    'StrategyOptimizationSample', 'WalkForwardStrategyReport',
  ],
  'src/server/worldCup/strategyResearchEndpoint.ts': ['HISTORICAL_RESULTS_URLS'],
  'src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts': [
    'WorldCupDomainRefreshCoordinator',
  ],
  'src/modules/sports/football/worldCup/research/strategyResearchSnapshot.ts': [
    'WorldCupStrategyResearchProvenance',
  ],
};

type KnipSymbol = { name: string };
type KnipIssue = {
  file: string;
  exports: KnipSymbol[];
  types: KnipSymbol[];
  duplicates: KnipSymbol[][];
  [collection: string]: string | unknown[];
};

const runKnip = (): KnipIssue[] => {
  const result = spawnSync('npm', ['run', 'report:dead-code', '--silent'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
  });
  const json = result.stdout.trim().split('\n').findLast((line) => line.startsWith('{'));
  if (!json) throw new Error(`Knip emitted no JSON: ${result.stderr}`);
  return (JSON.parse(json) as { issues: KnipIssue[] }).issues;
};

const reportedSymbols = (issue: KnipIssue): string[] => [
  ...issue.exports.map(({ name }) => name),
  ...issue.types.map(({ name }) => name),
  ...issue.duplicates.flatMap((group) => group.map(({ name }) => name)),
];

describe('dead-code export policy', () => {
  let issues: KnipIssue[];

  beforeAll(() => {
    issues = runKnip();
  }, 15_000);

  it('completed dead-code batches do not reappear', () => {
    const removedSymbolsStillReported = issues.flatMap((issue) => {
      const removed = new Set(REMOVED_EXPORT_SURFACE[issue.file] ?? []);
      return reportedSymbols(issue)
        .filter((name) => removed.has(name))
        .map((name) => `${issue.file}:${name}`);
    });

    expect(removedSymbolsStillReported).toEqual([]);
  });

  it('Knip has no remaining issues', () => {
    const reportedIssues = issues.flatMap((issue) =>
      Object.entries(issue).flatMap(([collection, values]) => {
        if (collection === 'file' || !Array.isArray(values)) return [];
        return values.map((value) => `${issue.file}:${collection}:${JSON.stringify(value)}`);
      }),
    );

    expect(reportedIssues).toEqual([]);
  });
});
