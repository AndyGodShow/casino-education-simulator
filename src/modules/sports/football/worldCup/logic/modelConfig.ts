export type WorldCupEvidenceShrinkageMultiplierKey =
  | 'knockout'
  | 'close'
  | 'mismatch'
  | 'lowTempo'
  | 'lowCoverage'
  | 'highCoverage';

export type WorldCupEvidenceDrawCorrectionMultiplierKey =
  | 'knockout'
  | 'close'
  | 'mismatch'
  | 'lowTempo'
  | 'lowCoverage'
  | 'max';

export type WorldCupStrategyCalibrationOverrides = {
  shrinkageMultiplier?: Partial<Record<WorldCupEvidenceShrinkageMultiplierKey, number>>;
  drawCorrectionMultiplier?: Partial<Record<WorldCupEvidenceDrawCorrectionMultiplierKey, number>>;
};

export const WORLD_CUP_MODEL_CONFIG = {
  modelVersion: 'world-cup-v2-reliability',
  backtest: {
    minimumCalibrationSampleSize: 30,
    minimumCalibrationStageCoverage: 2,
  },
  strategyTuning: {
    minimumScenarioSamples: 6,
    brierUnderperformanceMargin: 0.04,
    drawRateGapThreshold: 0.08,
    maxMultiplierStep: 0.12,
  },
  actionGate: {
    highMarketDisagreement: 0.24,
    highMotivationSwing: 0.35,
    minimumPositiveReferenceEv: 0.015,
    maxStandardSimulatedStakeFraction: 0.02,
    maxCappedSimulatedStakeFraction: 0.005,
    fullStakeReferenceEv: 0.08,
    minimumTopTwoProbabilityGap: 0.06,
    uncertaintyStakePenalty: 0.5,
  },
  marketFusion: {
    maxStalenessMinutes: 15,
    minimumConfidence: 0.45,
    minimumQuality: 'medium',
  },
  featureLayer: {
    goalCompressionAlpha: 1.2,
    evidenceCalibration: {
      coverageNoShrinkThreshold: 0.85,
      maxLambdaShrinkage: 0.28,
      maxContextualLambdaShrinkage: 0.45,
      neutralLambda: 1.25,
      buckets: {
        closeEdgeThreshold: 0.22,
        mismatchEdgeThreshold: 0.7,
        lowTempoGoalThreshold: 2.15,
        highTempoGoalThreshold: 3.1,
        lowCoverageThreshold: 0.5,
        partialCoverageThreshold: 0.8,
      },
      shrinkageMultiplier: {
        knockout: 1.12,
        close: 1.12,
        mismatch: 0.82,
        lowTempo: 1.06,
        lowCoverage: 1.18,
        highCoverage: 0.72,
      },
      drawCorrectionMultiplier: {
        knockout: 1.1,
        close: 1.08,
        lowTempo: 1.12,
        lowCoverage: 1.1,
        mismatch: 0.85,
        max: 1.4,
      },
    },
    ratingFallback: 75,
    lambdaClamp: {
      min: 0.2,
      max: 4.5,
    },
    baseStrength: {
      baseline: 0.85,
      ratingReference: 60,
      ratingWeight: 0.014,
    },
    attackDefenseWeight: 0.014,
    formAdjustmentWeight: 0.014,
    matchupAsymmetryWeight: 0.008,
    homeAdvantage: {
      host: 0.28,
      nonHost: 0,
      away: 0,
    },
    stageMultiplier: {
      group: 1,
      knockout: 0.96,
    },
    motivation: {
      urgencyScale: 0.75,
      maxDirectionalLambdaShift: 0.12,
      maxTempoLambdaShift: 0.05,
      highTempoUrgency: 0.8,
    },
    advanced: {
      provenanceWeight: {
        high: 1,
        medium: 0.72,
        low: 0.35,
        unsourced: 0.65,
      },
      elo: {
        weight: 0.0008,
        clamp: { min: -0.16, max: 0.16 },
      },
      xg: {
        baseline: 1.35,
        weight: 0.08,
        clamp: { min: -0.16, max: 0.16 },
      },
      squadAvailability: {
        baseline: 85,
        weight: 0.006,
        clamp: { min: -0.24, max: 0.12 },
      },
      rest: {
        weight: 0.025,
        clamp: { min: -0.12, max: 0.12 },
      },
      travel: {
        weight: 0.12,
        clamp: { min: 0, max: 1 },
      },
    },
  },
  scoreDistribution: {
    drawMassCorrection: {
      edgeThreshold: 0.5,
      maxDiagonalBoost: 0.45,
      lowTempoGoalThreshold: 2.35,
      lowTempoMaxAdditionalBoost: 0.18,
    },
  },
  reliability: {
    labelThresholds: {
      high: 0.7,
      medium: 0.45,
    },
    inputCoverageThresholds: {
      low: 0.5,
      partial: 0.8,
    },
    advancedMetricTrustThresholds: {
      low: 0.55,
      partial: 0.75,
      staleHours: 72,
    },
    calibrationThresholds: {
      overconfidenceError: 0.08,
      weakBrierRatio: 0.95,
    },
    deductions: {
      localSource: 0.35,
      sampleSource: 0.3,
      verifiedProviderNotOfficial: 0.12,
      staleData: 0.1,
      unknownStaleness: 0.08,
      missingInputCoverage: 0.16,
      lowInputCoverage: 0.2,
      partialInputCoverage: 0.08,
      missingAdvancedMetricSources: 0.08,
      lowTrustAdvancedMetrics: 0.12,
      partialTrustAdvancedMetrics: 0.06,
      staleAdvancedMetrics: 0.07,
      unknownAdvancedMetricFreshness: 0.06,
      lowIntelligenceCoverage: 0.12,
      proxyHeavyIntelligence: 0.06,
      missingSquadContext: 0.05,
      missingMarketReference: 0.04,
      missingScheduleTravelContext: 0.05,
      noCalibrationSample: 0.12,
      insufficientCalibrationSample: 0.08,
      calibrationOverconfidence: 0.08,
      weakCalibrationPerformance: 0.1,
      providerOnlyCalibrationEvidence: 0.06,
      mixedCalibrationEvidence: 0.03,
      insufficientCombinedCalibrationEvidence: 0.08,
      sampleOrLocalOnlyCalibrationEvidence: 0.12,
      emptyCombinedCalibrationEvidence: 0.1,
      predictionAuditWarning: 0.1,
      predictionAuditFailed: 0.25,
    },
  },
} as const;
