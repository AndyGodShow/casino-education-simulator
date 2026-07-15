# Dead-Code Export Remediation Implementation Plan

> **For Arc:** Use /arc:implement to execute this plan. Subagents should report DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, BLOCKED, or AUTH_GATE.

**Source:** Current Knip 6.26.0 JSON inventory generated on 2026-07-14: 46 unused exports, 97 unused exported types, two duplicate-export groups, and 46 production files with real findings. All six api/world-cup/*.ts handlers are configured as Vercel entrypoints and are absent from the issue inventory.
**Goal:** Reduce every real Knip export, exported-type, and duplicate-export finding to zero while preserving internally used declarations and runtime behavior.
**Stack:** React 19 + Vite 7 + TypeScript 5.9 + Vitest 4 + Playwright 1.60 + Knip + npm
**Planned at:** 8332a25
**Out of scope:** Deleting internally used declarations, changing public runtime behavior, deleting Vercel entrypoints, renaming supported APIs, or hiding findings with Knip ignores.

---

Use the exact file/symbol inventory embedded in each task. Prefer deleting an unnecessary barrel re-export; otherwise remove only the declaration's export modifier. Never delete a declaration that still has same-file consumers. Every cleanup task extends src/scripts/deadCodePolicy.test.ts with its exact file/symbol pairs so a completed batch cannot regress while later batches remain.

<task id="1" depends="" type="auto">
  <name>Prune strategy and country-map exports</name>
  <files>
    <modify>src/games/baccarat/logic/Strategies.ts</modify>
    <modify>src/games/blackjack/logic/BlackjackStrategies.ts</modify>
    <modify>src/games/roulette/logic/RouletteStrategies.ts</modify>
    <modify>src/utils/countryNameMap.ts</modify>
    <test>src/scripts/deadCodePolicy.test.ts</test>
  </files>
  <read_first>
    src/games/SimulationStrategies.test.ts
    src/utils/countryNameMap.test.ts
    src/architecture/knip-policy.test.ts
  </read_first>
  <action>
    Remove only these unused exports:
    - src/games/baccarat/logic/Strategies.ts: MartingaleStrategy, AlwaysTieStrategy, RandomStrategy, MartingaleRandomStrategy.
    - src/games/blackjack/logic/BlackjackStrategies.ts: ParoliBasicStrategy, ConservativeStandStrategy, AggressiveDoubleStrategy, FlatDealerWeakStrategy, LossLimitBasicStrategy, MartingaleBasicStrategy, DealerMimicStrategy.
    - src/games/roulette/logic/RouletteStrategies.ts: FlatOutsideStrategy, MartingaleRedStrategy, DAlembertRedStrategy, ParoliRedStrategy, DozenRotationStrategy, ColumnSpreadStrategy, StraightNumberStrategy, RandomOutsideStrategy.
    - src/utils/countryNameMap.ts: countryNameMap, uiVocabularyMap.
    Create src/scripts/deadCodePolicy.test.ts with a REMOVED_EXPORT_SURFACE record keyed by those four paths. Run npm run report:dead-code through child_process.spawnSync, parse stdout JSON even when Knip exits non-zero, flatten each issue's exports, types, and both names in every duplicates group, and assert that none of the recorded names remains for its file.
  </action>
  <test_code>
    The test named completed dead-code batches do not reappear must compare every REMOVED_EXPORT_SURFACE file/name pair with the parsed Knip issues and expect the intersection to equal [].
  </test_code>
  <verify>
    npm test -- --run src/scripts/deadCodePolicy.test.ts src/games/SimulationStrategies.test.ts src/utils/countryNameMap.test.ts — passes.
    npm run report:dead-code — reports none of the four assigned file/symbol sets.
  </verify>
  <done>The assigned strategy and country-map names are absent from Knip while their declarations remain available to same-file consumers.</done>
  <commit>refactor(exports): prune strategy utility surface</commit>
</task>

<task id="2" depends="1" type="auto">
  <name>Prune dice, odds, trust-layer, and alpha-evaluator exports</name>
  <files>
    <modify>src/utils/dicePips.ts</modify>
    <modify>src/modules/sports/football/worldCup/logic/oddsEngine.ts</modify>
    <modify>src/modules/core/trustLayer/dataTruth.ts</modify>
    <modify>src/modules/sports/football/worldCup/alpha/alphaEvaluator.ts</modify>
    <test>src/scripts/deadCodePolicy.test.ts</test>
  </files>
  <read_first>
    src/utils/dicePips.test.ts
    src/modules/sports/football/worldCup/logic/oddsEngine.test.ts
    src/modules/sports/football/worldCup/alpha/alphaEvaluator.test.ts
    src/scripts/deadCodePolicy.test.ts
  </read_first>
  <action>
    Remove only these inventory items and add the same path/name arrays to REMOVED_EXPORT_SURFACE:
    - src/utils/dicePips.ts unused export: DICE_PIP_PATTERNS.
    - src/modules/sports/football/worldCup/logic/oddsEngine.ts unused export: normalizeBookProbabilities.
    - src/modules/core/trustLayer/dataTruth.ts unused exports: TRUTH_LEVEL_LABELS, TRUTH_LEVEL_CONFIDENCE, clampConfidence.
    - src/modules/sports/football/worldCup/alpha/alphaEvaluator.ts unused export: computeSignalAttribution; unused exported types: BucketResult, CalibrationDrift, SignalAttribution.
  </action>
  <test_code>
    Extend REMOVED_EXPORT_SURFACE with exactly DICE_PIP_PATTERNS, normalizeBookProbabilities, TRUTH_LEVEL_LABELS, TRUTH_LEVEL_CONFIDENCE, clampConfidence, computeSignalAttribution, BucketResult, CalibrationDrift, and SignalAttribution under their listed paths; the existing intersection assertion must remain unchanged.
  </test_code>
  <verify>
    npm test -- --run src/scripts/deadCodePolicy.test.ts src/utils/dicePips.test.ts src/modules/sports/football/worldCup/logic/oddsEngine.test.ts src/modules/sports/football/worldCup/alpha/alphaEvaluator.test.ts — passes.
    npm run typecheck — exits 0.
  </verify>
  <done>The assigned dice, odds, trust-layer, and evaluator findings are absent from Knip.</done>
  <commit>refactor(exports): narrow odds and evaluator surface</commit>
</task>

<task id="3" depends="2" type="auto">
  <name>Prune alpha-store, signal-layer, alpha-engine, and score exports</name>
  <files>
    <modify>src/modules/sports/football/worldCup/alpha/alphaStore.ts</modify>
    <modify>src/modules/sports/football/worldCup/logic/signalLayer.ts</modify>
    <modify>src/modules/sports/football/worldCup/logic/alphaEngine.ts</modify>
    <modify>src/modules/sports/football/worldCup/logic/scoreDistribution.ts</modify>
    <test>src/scripts/deadCodePolicy.test.ts</test>
  </files>
  <read_first>
    src/modules/sports/football/worldCup/alpha/alphaStore.test.ts
    src/modules/sports/football/worldCup/logic/signalLayer.test.ts
    src/modules/sports/football/worldCup/logic/alphaEngine.test.ts
    src/modules/sports/football/worldCup/logic/scoreDistribution.test.ts
  </read_first>
  <action>
    Remove only these inventory items and add their exact path/name arrays to REMOVED_EXPORT_SURFACE:
    - src/modules/sports/football/worldCup/alpha/alphaStore.ts unused exports: MAX_ALPHA_RECORDS, defaultAlphaStore; unused exported type: OneX2Probability.
    - src/modules/sports/football/worldCup/logic/signalLayer.ts unused export: computeSignals; unused exported type: AlphaSignalQuality; duplicate-export pair: computeSignalLayer and computeSignals. Preserve computeSignalLayer as the consumed implementation and remove the unused computeSignals alias/export.
    - src/modules/sports/football/worldCup/logic/alphaEngine.ts unused export: applyAlphaSignalsToLambda.
    - src/modules/sports/football/worldCup/logic/scoreDistribution.ts unused export: applyDrawMassCorrection.
  </action>
  <test_code>
    Record MAX_ALPHA_RECORDS, defaultAlphaStore, OneX2Probability, computeSignals, AlphaSignalQuality, computeSignalLayer, applyAlphaSignalsToLambda, and applyDrawMassCorrection under the four listed paths; the policy test must find none after cleanup.
  </test_code>
  <verify>
    npm test -- --run src/scripts/deadCodePolicy.test.ts src/modules/sports/football/worldCup/alpha/alphaStore.test.ts src/modules/sports/football/worldCup/logic/signalLayer.test.ts src/modules/sports/football/worldCup/logic/alphaEngine.test.ts src/modules/sports/football/worldCup/logic/scoreDistribution.test.ts — passes.
    npm run typecheck — exits 0.
  </verify>
  <done>The assigned alpha, signal, and score findings, including the signal duplicate pair, are absent from Knip.</done>
  <commit>refactor(exports): narrow signal calculation surface</commit>
</task>

<task id="4" depends="3" type="auto">
  <name>Prune consistency, educational odds, Polymarket, and fixture exports</name>
  <files>
    <modify>src/modules/sports/football/worldCup/logic/consistencyValidator.ts</modify>
    <modify>src/modules/sports/football/worldCup/data/educationalOdds.ts</modify>
    <modify>src/dataProviders/polymarket/adapters.ts</modify>
    <modify>src/dataProviders/football/fixtureProvider.ts</modify>
    <test>src/scripts/deadCodePolicy.test.ts</test>
  </files>
  <read_first>
    src/modules/sports/football/worldCup/domain/buildWorldCupDomain.test.ts
    src/dataProviders/polymarket/polymarketAdapters.test.ts
    src/dataProviders/football/fixtureProvider.test.ts
    src/scripts/deadCodePolicy.test.ts
  </read_first>
  <action>
    Remove only these inventory items and add their exact path/name arrays to REMOVED_EXPORT_SURFACE:
    - src/modules/sports/football/worldCup/logic/consistencyValidator.ts unused export: validateBehavioralConstraints.
    - src/modules/sports/football/worldCup/data/educationalOdds.ts unused export: educationalOdds.
    - src/dataProviders/polymarket/adapters.ts duplicate-export pair: marketQualityScore and calculateMarketQuality. Preserve marketQualityScore as the consumed implementation and remove the redundant calculateMarketQuality alias/re-export.
    - src/dataProviders/football/fixtureProvider.ts unused exported type: WorldCupProviderOutput.
  </action>
  <test_code>
    Record validateBehavioralConstraints, educationalOdds, marketQualityScore, calculateMarketQuality, and WorldCupProviderOutput under their listed paths; the policy test must find none in Knip after the redundant aliases/exports are removed.
  </test_code>
  <verify>
    npm test -- --run src/scripts/deadCodePolicy.test.ts src/modules/sports/football/worldCup/domain/buildWorldCupDomain.test.ts src/dataProviders/polymarket/polymarketAdapters.test.ts src/dataProviders/football/fixtureProvider.test.ts — passes.
    npm run typecheck — exits 0.
  </verify>
  <done>The assigned validation, educational-odds, Polymarket duplicate, and fixture findings are absent from Knip.</done>
  <commit>refactor(exports): prune provider adapter aliases</commit>
</task>

<task id="5" depends="4" type="auto">
  <name>Prune football and World Cup domain type exports</name>
  <files>
    <modify>src/dataProviders/football/types.ts</modify>
    <modify>src/modules/sports/football/worldCup/types.ts</modify>
    <modify>src/modules/sports/football/worldCup/data/publicWorldCupSnapshot.ts</modify>
    <modify>src/modules/sports/football/worldCup/domain/WorldCupDomainModel.ts</modify>
    <test>src/scripts/deadCodePolicy.test.ts</test>
  </files>
  <read_first>
    src/dataProviders/football/fixtureProvider.test.ts
    src/server/worldCup/publicEvidenceJob.test.ts
    src/modules/sports/football/worldCup/domain/buildWorldCupDomain.test.ts
    src/scripts/deadCodePolicy.test.ts
  </read_first>
  <action>
    Remove only these unused exported types and add their exact path/name arrays to REMOVED_EXPORT_SURFACE:
    - src/dataProviders/football/types.ts: FootballProviderStatus.
    - src/modules/sports/football/worldCup/types.ts: IntelligenceFactorSide, MatchIntelligenceCoverage, PredictionRiskBand, MatchAdvancedFeatureContribution.
    - src/modules/sports/football/worldCup/data/publicWorldCupSnapshot.ts: PublicWorldCupAdapterResult.
    - src/modules/sports/football/worldCup/domain/WorldCupDomainModel.ts: MatchViewModel, TeamViewModel, MatchDataStaleness.
    Preserve every serialized field and every type still imported outside its declaring file.
  </action>
  <test_code>
    Add exactly FootballProviderStatus, IntelligenceFactorSide, MatchIntelligenceCoverage, PredictionRiskBand, MatchAdvancedFeatureContribution, PublicWorldCupAdapterResult, MatchViewModel, TeamViewModel, and MatchDataStaleness to the policy record under their listed paths.
  </test_code>
  <verify>
    npm test -- --run src/scripts/deadCodePolicy.test.ts src/dataProviders/football/fixtureProvider.test.ts src/server/worldCup/publicEvidenceJob.test.ts src/modules/sports/football/worldCup/domain/buildWorldCupDomain.test.ts — passes.
    npm run typecheck — exits 0.
  </verify>
  <done>The assigned provider, snapshot, and domain exported-type findings are absent from Knip.</done>
  <commit>refactor(exports): narrow world cup domain types</commit>
</task>

<task id="6" depends="5" type="auto">
  <name>Prune simulation, probability, and backtest core types</name>
  <files>
    <modify>src/components/Common/Simulation/stats.ts</modify>
    <modify>src/modules/core/probability/unifiedProbability.ts</modify>
    <modify>src/modules/sports/football/worldCup/backtest/types.ts</modify>
    <modify>src/modules/sports/football/worldCup/backtest/worldCupBacktest.ts</modify>
    <test>src/scripts/deadCodePolicy.test.ts</test>
  </files>
  <read_first>
    src/components/Common/Simulation/stats.test.ts
    src/modules/core/probability/unifiedProbability.test.ts
    src/modules/sports/football/worldCup/backtest/worldCupBacktest.test.ts
    src/scripts/deadCodePolicy.test.ts
  </read_first>
  <action>
    Remove only these unused exported types and add their exact path/name arrays to REMOVED_EXPORT_SURFACE:
    - src/components/Common/Simulation/stats.ts: BatchTestMethodId.
    - src/modules/core/probability/unifiedProbability.ts: ProbabilitySource.
    - src/modules/sports/football/worldCup/backtest/types.ts: WorldCupBacktestPredictionOrigin, WorldCupBacktestStageBucket, WorldCupBacktestEdgeBucket, WorldCupBacktestTempoBucket, WorldCupBacktestCoverageBucket.
    - src/modules/sports/football/worldCup/backtest/worldCupBacktest.ts: WorldCupBacktestBucket, WorldCupBacktestCalibrationReadiness, WorldCupBacktestMetrics, WorldCupBacktestSourceTier, WorldCupConfidenceBacktestBucket.
  </action>
  <test_code>
    Add all 12 listed type names to REMOVED_EXPORT_SURFACE under their exact paths; the completed-batch intersection must remain empty.
  </test_code>
  <verify>
    npm test -- --run src/scripts/deadCodePolicy.test.ts src/components/Common/Simulation/stats.test.ts src/modules/core/probability/unifiedProbability.test.ts src/modules/sports/football/worldCup/backtest/worldCupBacktest.test.ts — passes.
    npm run typecheck — exits 0.
  </verify>
  <done>The assigned simulation, probability, and backtest core type findings are absent from Knip.</done>
  <commit>refactor(exports): narrow simulation backtest types</commit>
</task>

<task id="7" depends="6" type="auto">
  <name>Prune backtest summary, history, config, and tuning types</name>
  <files>
    <modify>src/modules/sports/football/worldCup/backtest/combinedAuditSummary.ts</modify>
    <modify>src/modules/sports/football/worldCup/backtest/historicalBacktest.ts</modify>
    <modify>src/modules/sports/football/worldCup/logic/modelConfig.ts</modify>
    <modify>src/modules/sports/football/worldCup/backtest/strategyTuning.ts</modify>
    <test>src/scripts/deadCodePolicy.test.ts</test>
  </files>
  <read_first>
    src/modules/sports/football/worldCup/backtest/combinedAuditSummary.test.ts
    src/modules/sports/football/worldCup/backtest/historicalBacktest.test.ts
    src/modules/sports/football/worldCup/backtest/strategyTuning.test.ts
    src/scripts/deadCodePolicy.test.ts
  </read_first>
  <action>
    Remove only these unused exported types and add their exact path/name arrays to REMOVED_EXPORT_SURFACE:
    - src/modules/sports/football/worldCup/backtest/combinedAuditSummary.ts: WorldCupCombinedCalibrationEvidenceStatus.
    - src/modules/sports/football/worldCup/backtest/historicalBacktest.ts: HistoricalBacktestRejectionReason, HistoricalBacktestAudit, HistoricalBacktestCsvRejectionReason, HistoricalBacktestCsvAudit.
    - src/modules/sports/football/worldCup/logic/modelConfig.ts: WorldCupEvidenceShrinkageMultiplierKey, WorldCupEvidenceDrawCorrectionMultiplierKey.
    - src/modules/sports/football/worldCup/backtest/strategyTuning.ts: WorldCupStrategyTuningParameter, WorldCupStrategyTuningDirection, WorldCupStrategyTuningRecommendation, WorldCupStrategyTuningPatchChange.
  </action>
  <test_code>
    Add all 11 listed type names to REMOVED_EXPORT_SURFACE under their exact paths and retain the empty-intersection assertion.
  </test_code>
  <verify>
    npm test -- --run src/scripts/deadCodePolicy.test.ts src/modules/sports/football/worldCup/backtest/combinedAuditSummary.test.ts src/modules/sports/football/worldCup/backtest/historicalBacktest.test.ts src/modules/sports/football/worldCup/backtest/strategyTuning.test.ts — passes.
    npm run typecheck — exits 0.
  </verify>
  <done>The assigned summary, historical, model-config, and tuning findings are absent from Knip.</done>
  <commit>refactor(exports): narrow backtest support types</commit>
</task>

<task id="8" depends="7" type="auto">
  <name>Prune persistence and calibration type exports</name>
  <files>
    <modify>src/modules/sports/football/worldCup/calibration/alphaPersistence.ts</modify>
    <modify>src/modules/sports/football/worldCup/calibration/calibrationSummary.ts</modify>
    <modify>src/modules/sports/football/worldCup/calibration/marketAlignment.ts</modify>
    <modify>src/modules/sports/football/worldCup/calibration/outcomeCalibration.ts</modify>
    <test>src/scripts/deadCodePolicy.test.ts</test>
  </files>
  <read_first>
    src/modules/sports/football/worldCup/calibration/alphaPersistence.test.ts
    src/modules/sports/football/worldCup/calibration/calibrationSummary.test.ts
    src/modules/sports/football/worldCup/calibration/marketAlignment.test.ts
    src/modules/sports/football/worldCup/calibration/outcomeCalibration.test.ts
  </read_first>
  <action>
    Remove only these unused exported types and add their exact path/name arrays to REMOVED_EXPORT_SURFACE:
    - src/modules/sports/football/worldCup/calibration/alphaPersistence.ts: SignalStabilityRanking.
    - src/modules/sports/football/worldCup/calibration/calibrationSummary.ts: CalibrationGrade.
    - src/modules/sports/football/worldCup/calibration/marketAlignment.ts: DirectionConsistency.
    - src/modules/sports/football/worldCup/calibration/outcomeCalibration.ts: CalibrationCurveBucket, OverconfidenceReport.
    Preserve persistence serialization and all externally consumed calibration entrypoints.
  </action>
  <test_code>
    Add SignalStabilityRanking, CalibrationGrade, DirectionConsistency, CalibrationCurveBucket, and OverconfidenceReport to REMOVED_EXPORT_SURFACE under their exact paths.
  </test_code>
  <verify>
    npm test -- --run src/scripts/deadCodePolicy.test.ts src/modules/sports/football/worldCup/calibration/alphaPersistence.test.ts src/modules/sports/football/worldCup/calibration/calibrationSummary.test.ts src/modules/sports/football/worldCup/calibration/marketAlignment.test.ts src/modules/sports/football/worldCup/calibration/outcomeCalibration.test.ts — passes.
    npm run typecheck — exits 0.
  </verify>
  <done>The assigned persistence and calibration type findings are absent from Knip.</done>
  <commit>refactor(exports): narrow calibration support types</commit>
</task>

<task id="9" depends="8" type="auto">
  <name>Prune bookmaker, motivation, Poisson, and provider-quality types</name>
  <files>
    <modify>src/modules/sports/football/worldCup/logic/bookmakerEngine.ts</modify>
    <modify>src/modules/sports/football/worldCup/logic/groupMotivation.ts</modify>
    <modify>src/modules/sports/football/worldCup/logic/poissonModel.ts</modify>
    <modify>src/modules/sports/football/worldCup/logic/providerQualityRegistry.ts</modify>
    <test>src/scripts/deadCodePolicy.test.ts</test>
  </files>
  <read_first>
    src/modules/sports/football/worldCup/logic/bookmakerEngine.test.ts
    src/modules/sports/football/worldCup/logic/groupMotivation.test.ts
    src/modules/sports/football/worldCup/logic/poissonModel.test.ts
    src/modules/sports/football/worldCup/logic/providerQualityRegistry.test.ts
  </read_first>
  <action>
    Remove only these unused exported types and add their exact path/name arrays to REMOVED_EXPORT_SURFACE:
    - src/modules/sports/football/worldCup/logic/bookmakerEngine.ts: BookmakerExposure.
    - src/modules/sports/football/worldCup/logic/groupMotivation.ts: TeamMotivationState.
    - src/modules/sports/football/worldCup/logic/poissonModel.ts: ScoreProbability.
    - src/modules/sports/football/worldCup/logic/providerQualityRegistry.ts: FootballProviderFieldCoverage.
  </action>
  <test_code>
    Add BookmakerExposure, TeamMotivationState, ScoreProbability, and FootballProviderFieldCoverage to REMOVED_EXPORT_SURFACE under their exact paths.
  </test_code>
  <verify>
    npm test -- --run src/scripts/deadCodePolicy.test.ts src/modules/sports/football/worldCup/logic/bookmakerEngine.test.ts src/modules/sports/football/worldCup/logic/groupMotivation.test.ts src/modules/sports/football/worldCup/logic/poissonModel.test.ts src/modules/sports/football/worldCup/logic/providerQualityRegistry.test.ts — passes.
    npm run typecheck — exits 0.
  </verify>
  <done>The assigned bookmaker, motivation, Poisson, and provider-quality findings are absent from Knip.</done>
  <commit>refactor(exports): narrow football model types</commit>
</task>

<task id="10" depends="9" type="auto">
  <name>Prune research, Craps, and SimulationPanel barrel types</name>
  <files>
    <modify>src/modules/sports/football/worldCup/research/internationalResults.ts</modify>
    <modify>src/modules/sports/football/worldCup/research/walkForwardOptimizer.ts</modify>
    <modify>src/games/craps/types.ts</modify>
    <modify>src/components/SimulationPanel/index.ts</modify>
    <test>src/scripts/deadCodePolicy.test.ts</test>
  </files>
  <read_first>
    src/modules/sports/football/worldCup/research/internationalResults.test.ts
    src/modules/sports/football/worldCup/research/walkForwardOptimizer.test.ts
    src/games/craps/logic/CrapsEngine.test.ts
    src/components/SimulationPanel/SimulationPanel.tsx
  </read_first>
  <action>
    Remove only these unused exported types and add their exact path/name arrays to REMOVED_EXPORT_SURFACE:
    - src/modules/sports/football/worldCup/research/internationalResults.ts: InternationalResultsRejectionReason.
    - src/modules/sports/football/worldCup/research/walkForwardOptimizer.ts: StrategyEvaluationMetrics.
    - src/games/craps/types.ts: CrapsRoundStatus.
    - src/components/SimulationPanel/index.ts: SimulationPanelProps, StatBoxProps. Prefer removing these unused barrel re-exports; do not change the component's locally used declarations.
  </action>
  <test_code>
    Add InternationalResultsRejectionReason, StrategyEvaluationMetrics, CrapsRoundStatus, SimulationPanelProps, and StatBoxProps to REMOVED_EXPORT_SURFACE under their exact paths.
  </test_code>
  <verify>
    npm test -- --run src/scripts/deadCodePolicy.test.ts src/modules/sports/football/worldCup/research/internationalResults.test.ts src/modules/sports/football/worldCup/research/walkForwardOptimizer.test.ts src/games/craps/logic/CrapsEngine.test.ts — passes.
    npm run typecheck — exits 0.
  </verify>
  <done>The assigned research, Craps, and SimulationPanel barrel findings are absent from Knip.</done>
  <commit>refactor(exports): prune research and panel types</commit>
</task>

<task id="11" depends="10" type="auto">
  <name>Prune Blackjack, SimulationPanel, and backtest barrel exports</name>
  <files>
    <modify>src/games/blackjack/types.ts</modify>
    <modify>src/components/SimulationPanel/SimulationPanel.tsx</modify>
    <modify>src/modules/sports/football/worldCup/backtest/index.ts</modify>
    <test>src/scripts/deadCodePolicy.test.ts</test>
  </files>
  <read_first>
    src/games/blackjack/BlackjackGame.tsx
    src/components/SimulationPanel/index.ts
    src/modules/sports/football/worldCup/domain/buildWorldCupDomain.ts
    src/scripts/deadCodePolicy.test.ts
  </read_first>
  <action>
    Remove only these inventory items and add their exact path/name arrays to REMOVED_EXPORT_SURFACE:
    - src/games/blackjack/types.ts unused exported types: BlackjackHand, BlackjackRoundResult.
    - src/components/SimulationPanel/SimulationPanel.tsx unused exported types: StrategyOption, RunParams, ExtraControlsCtx.
    - src/modules/sports/football/worldCup/backtest/index.ts unused exports: runCombinedWorldCupBacktest, buildWorldCupStrategyCalibrationOverrides, recommendWorldCupStrategyTuning, buildHistoricalBacktestDataset, parseHistoricalBacktestCsv, runHistoricalWorldCupBacktest, LOCAL_SAMPLE_HISTORICAL_BACKTEST_CSV, buildStrategyScenarioContext, optimizeWorldCupStrategy, predictStrategyCandidate, strategyOptimizationSamplesFromTimeline.
    - src/modules/sports/football/worldCup/backtest/index.ts unused exported types: WorldCupBacktestBucket, WorldCupBacktestCalibrationReadiness, WorldCupBacktestCalibrationUsabilityStatus, WorldCupBacktestMetrics, WorldCupBacktestQuality, WorldCupBacktestScenarioBuckets, WorldCupBacktestScenarioProfile, WorldCupBacktestStageCoverage, WorldCupBacktestSourceCoverage, WorldCupBacktestSourceTier, WorldCupCombinedBacktestAudit, WorldCupCombinedBacktestOriginAudit, WorldCupCombinedBacktestRun, WorldCupCombinedCalibrationAudit, WorldCupConfidenceBacktestBucket, CombinedWorldCupBacktestInput, WorldCupBacktestQualitySummary, WorldCupCombinedCalibrationEvidenceStatus, WorldCupCombinedCalibrationSummary, CombinedWorldCupCalibrationRun, WorldCupStrategyTuningDirection, WorldCupStrategyTuningPatch, WorldCupStrategyTuningPatchChange, WorldCupStrategyTuningParameter, WorldCupStrategyTuningRecommendation, WorldCupStrategyTuningReport, HistoricalBacktestAudit, HistoricalBacktestCsvAudit, HistoricalBacktestCsvParse, HistoricalBacktestCsvRejectionReason, HistoricalBacktestDataset, HistoricalBacktestImportSummary, HistoricalBacktestRejectionReason, HistoricalBacktestRow, StrategyCandidate, StrategyEvaluationMetrics, StrategyOptimizationSample, WalkForwardStrategyReport.
    For backtest/index.ts, remove unnecessary barrel re-exports only; do not change declarations in the source modules and do not remove any barrel name that has become consumed after plan drift.
  </action>
  <test_code>
    Add BlackjackHand, BlackjackRoundResult, StrategyOption, RunParams, ExtraControlsCtx, and every explicitly listed backtest/index.ts value and type to REMOVED_EXPORT_SURFACE. The policy test must report an empty intersection for all 43 production inventory files.
  </test_code>
  <verify>
    npm test -- --run src/scripts/deadCodePolicy.test.ts — passes.
    npm run report:dead-code — contains zero unused exports, zero unused exported types, and zero duplicate-export groups.
    npm run typecheck — exits 0.
  </verify>
  <done>All original baseline inventory files are clear of unused exports, unused exported types, and duplicate exports.</done>
  <commit>refactor(exports): clear final barrel noise</commit>
</task>

<task id="12" depends="11" type="auto">
  <name>Prune post-plan World Cup export drift</name>
  <files>
    <modify>src/server/worldCup/strategyResearchEndpoint.ts</modify>
    <modify>src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts</modify>
    <modify>src/modules/sports/football/worldCup/research/strategyResearchSnapshot.ts</modify>
    <test>src/scripts/deadCodePolicy.test.ts</test>
  </files>
  <read_first>
    src/server/worldCup/strategyResearchEndpoint.test.ts
    src/modules/sports/football/worldCup/hooks/useWorldCupDomain.test.ts
    src/modules/sports/football/worldCup/research/strategyResearchSnapshot.test.ts
    src/scripts/deadCodePolicy.test.ts
  </read_first>
  <action>
    Remove only these post-plan inventory items and add their exact path/name arrays to REMOVED_EXPORT_SURFACE:
    - src/server/worldCup/strategyResearchEndpoint.ts unused export: HISTORICAL_RESULTS_URLS.
    - src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts unused exported type: WorldCupDomainRefreshCoordinator.
    - src/modules/sports/football/worldCup/research/strategyResearchSnapshot.ts unused exported type: WorldCupStrategyResearchProvenance.
    Keep each declaration available to same-file consumers and preserve endpoint, refresh-coordination, and snapshot serialization behavior.
  </action>
  <test_code>Add exactly the three listed path/name pairs to REMOVED_EXPORT_SURFACE; the completed-batch intersection must remain empty.</test_code>
  <verify>
    npm test -- --run src/scripts/deadCodePolicy.test.ts src/server/worldCup/strategyResearchEndpoint.test.ts src/modules/sports/football/worldCup/hooks/useWorldCupDomain.test.ts src/modules/sports/football/worldCup/research/strategyResearchSnapshot.test.ts — passes.
    npm run typecheck — exits 0.
    npm run report:dead-code — contains zero remaining issues.
  </verify>
  <done>The three post-plan World Cup export findings are absent from Knip without runtime changes.</done>
  <commit>refactor(exports): prune world cup export drift</commit>
</task>

<task id="13" depends="1,2,3,4,5,6,7,8,9,10,11,12" type="auto">
  <name>Run the strict dead-code and repository final gate</name>
  <files>
    <test>src/scripts/deadCodePolicy.test.ts</test>
  </files>
  <read_first>
    package.json
    knip.json
    playwright.config.ts
    src/scripts/deadCodePolicy.test.ts
  </read_first>
  <action>
    Strengthen src/scripts/deadCodePolicy.test.ts with a second test named Knip has no remaining issues. Parse npm run report:dead-code JSON and assert that, after excluding no files or symbols, every issue collection is empty: files, exports, types, duplicates, dependencies, devDependencies, optionalPeerDependencies, unlisted, unresolved, binaries, enumMembers, namespaceMembers, and catalog. Do not add ignores, exclusions, public tags, or source changes in this gate task.
  </action>
  <test_code>
    The final test must flatten every array-valued issue collection from the parsed report and assert the resulting array equals []. The earlier completed dead-code batches do not reappear test remains intact.
  </test_code>
  <verify>
    npm run check:dead-code — exits 0 with zero findings.
    npm run typecheck — exits 0.
    npm run lint — exits 0.
    npm test — all Vitest tests pass.
    npm run build — exits 0 and build budgets pass.
    npm run test:e2e — all Playwright tests pass.
    git diff --check — reports no whitespace errors.
  </verify>
  <done>Strict Knip, typecheck, lint, unit, build, E2E, and diff checks are all green without suppressions.</done>
  <commit>test(quality): verify dead-code remediation</commit>
</task>

## Decision log

- 2026-07-13: Re-ran PATH=$HOME/.nvm/versions/node/v22.22.3/bin:$PATH npx --yes knip --reporter json. Current inventory is 45 unused exports, 95 unused exported types, two duplicate-export groups, zero unresolved imports, and 43 production files with real findings.
- 2026-07-13: Excluded api/world-cup/data.ts, api/world-cup/health.ts, api/world-cup/prediction-snapshot.ts, and api/world-cup/research.ts from cleanup because the preceding plan's Knip entry configuration resolves these Vercel entrypoint false positives.
- 2026-07-13: Split cleanup into 11 batches so each task modifies no more than four production files plus src/scripts/deadCodePolicy.test.ts.
- 2026-07-13: Chose barrel re-export removal before declaration privacy and prohibited deletion of internally used declarations.
- 2026-07-14: Knip 6.26.0 reports 46 unused exports, 97 unused exported types, two duplicate groups, zero unused files, zero dependency findings, and zero unresolved imports across 46 production files. Tasks 1–11 retain the exact original inventory; Task 12 adds the exact three drift symbols listed there.
- 2026-07-14: The entrypoint configuration now covers six Vercel handlers, including client-telemetry.ts and telemetry-retention.ts; none appears in the Knip issue inventory.
