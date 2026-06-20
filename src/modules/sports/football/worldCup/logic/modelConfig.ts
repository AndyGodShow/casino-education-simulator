export const WORLD_CUP_MODEL_CONFIG = {
  modelVersion: 'world-cup-v2-reliability',
  backtest: {
    minimumCalibrationSampleSize: 30,
  },
  featureLayer: {
    goalCompressionAlpha: 1.2,
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
      nonHost: 0.12,
      away: 0,
    },
    stageMultiplier: {
      group: 1,
      knockout: 0.96,
    },
    advanced: {
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
      noCalibrationSample: 0.12,
      insufficientCalibrationSample: 0.08,
      calibrationOverconfidence: 0.08,
      weakCalibrationPerformance: 0.1,
      predictionAuditWarning: 0.1,
      predictionAuditFailed: 0.25,
    },
  },
} as const;
