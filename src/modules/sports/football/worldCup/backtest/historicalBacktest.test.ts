import { describe, expect, it } from 'vitest';
import {
  buildHistoricalBacktestDataset,
  parseHistoricalBacktestCsv,
  runHistoricalWorldCupBacktest,
  runHistoricalWorldCupBacktestFromCsv,
  summarizeHistoricalBacktestImport,
} from './historicalBacktest';
import { LOCAL_SAMPLE_HISTORICAL_BACKTEST_CSV } from './localSampleHistoricalBacktestFixture';

describe('buildHistoricalBacktestDataset', () => {
  it('normalizes valid historical rows into backtest samples', () => {
    const dataset = buildHistoricalBacktestDataset([
      {
        matchId: 'historical-1',
        stage: 'group',
        sourceTier: 'official',
        rawConfidence: 0.74,
        adjustedConfidence: 0.62,
        homeWin: 58,
        draw: 24,
        awayWin: 18,
        homeScore: 2,
        awayScore: 1,
      },
      {
        matchId: 'historical-2',
        stage: 'final',
        sourceTier: 'verified_provider',
        rawConfidence: 0.68,
        homeWin: 0.2,
        draw: 0.3,
        awayWin: 0.5,
        homeScore: 0,
        awayScore: 2,
      },
    ]);

    expect(dataset.samples).toEqual([
      {
        matchId: 'historical-1',
        stage: 'group',
        sourceTier: 'official',
        rawConfidence: 0.74,
        adjustedConfidence: 0.62,
        probabilities: {
          home: 0.58,
          draw: 0.24,
          away: 0.18,
        },
        outcome: 'home',
      },
      {
        matchId: 'historical-2',
        stage: 'final',
        sourceTier: 'verified_provider',
        rawConfidence: 0.68,
        adjustedConfidence: 0.68,
        probabilities: {
          home: 0.2,
          draw: 0.3,
          away: 0.5,
        },
        outcome: 'away',
      },
    ]);
    expect(dataset.audit).toEqual({
      totalRows: 2,
      acceptedRows: 2,
      rejectedRows: 0,
      rejectionReasons: {},
    });
  });

  it('accepts percent-style confidence and probability values', () => {
    const dataset = buildHistoricalBacktestDataset([
      {
        matchId: 'percent-style',
        stage: 'round16',
        sourceTier: 'verified_provider',
        rawConfidence: 72,
        adjustedConfidence: '61%',
        homeWin: '55%',
        draw: '25%',
        awayWin: '20%',
        homeScore: 2,
        awayScore: 0,
      },
    ]);

    expect(dataset.samples).toEqual([
      {
        matchId: 'percent-style',
        stage: 'round16',
        sourceTier: 'verified_provider',
        rawConfidence: 0.72,
        adjustedConfidence: 0.61,
        probabilities: {
          home: 0.55,
          draw: 0.25,
          away: 0.2,
        },
        outcome: 'home',
      },
    ]);
    expect(dataset.audit.rejectedRows).toBe(0);
  });

  it('rejects rows with invalid stage, source tier, score, probability, confidence, or missing id', () => {
    const dataset = buildHistoricalBacktestDataset([
      {
        matchId: '',
        stage: 'group',
        sourceTier: 'official',
        rawConfidence: 0.7,
        homeWin: 0.5,
        draw: 0.25,
        awayWin: 0.25,
        homeScore: 1,
        awayScore: 0,
      },
      {
        matchId: 'bad-stage',
        stage: 'league',
        sourceTier: 'official',
        rawConfidence: 0.7,
        homeWin: 0.5,
        draw: 0.25,
        awayWin: 0.25,
        homeScore: 1,
        awayScore: 0,
      },
      {
        matchId: 'bad-tier',
        stage: 'group',
        sourceTier: 'partner',
        rawConfidence: 0.7,
        homeWin: 0.5,
        draw: 0.25,
        awayWin: 0.25,
        homeScore: 1,
        awayScore: 0,
      },
      {
        matchId: 'bad-confidence',
        stage: 'group',
        sourceTier: 'official',
        rawConfidence: 1.2,
        homeWin: 0.5,
        draw: 0.25,
        awayWin: 0.25,
        homeScore: 1,
        awayScore: 0,
      },
      {
        matchId: 'bad-probability',
        stage: 'group',
        sourceTier: 'official',
        rawConfidence: 0.7,
        homeWin: 0,
        draw: 0,
        awayWin: 0,
        homeScore: 1,
        awayScore: 0,
      },
      {
        matchId: 'bad-score',
        stage: 'group',
        sourceTier: 'official',
        rawConfidence: 0.7,
        homeWin: 0.5,
        draw: 0.25,
        awayWin: 0.25,
        homeScore: -1,
        awayScore: 0,
      },
    ]);

    expect(dataset.samples).toEqual([]);
    expect(dataset.audit).toEqual({
      totalRows: 6,
      acceptedRows: 0,
      rejectedRows: 6,
      rejectionReasons: {
        missing_match_id: 1,
        invalid_stage: 1,
        invalid_source_tier: 1,
        invalid_confidence: 1,
        invalid_probability: 1,
        invalid_score: 1,
      },
    });
  });

  it('keeps accepted rows even when other rows are rejected', () => {
    const dataset = buildHistoricalBacktestDataset([
      {
        matchId: 'good',
        stage: 'semi',
        sourceTier: 'sample',
        rawConfidence: 0.44,
        adjustedConfidence: 0.31,
        homeWin: 0.3,
        draw: 0.2,
        awayWin: 0.5,
        homeScore: 1,
        awayScore: 3,
      },
      {
        matchId: 'bad',
        stage: 'semi',
        sourceTier: 'sample',
        rawConfidence: Number.NaN,
        homeWin: 0.3,
        draw: 0.2,
        awayWin: 0.5,
        homeScore: 1,
        awayScore: 3,
      },
    ]);

    expect(dataset.samples).toHaveLength(1);
    expect(dataset.samples[0].matchId).toBe('good');
    expect(dataset.audit.acceptedRows).toBe(1);
    expect(dataset.audit.rejectedRows).toBe(1);
  });

  it('rejects duplicate match ids after the first accepted row', () => {
    const dataset = buildHistoricalBacktestDataset([
      {
        matchId: 'duplicate',
        stage: 'group',
        sourceTier: 'official',
        rawConfidence: 0.71,
        homeWin: 0.55,
        draw: 0.25,
        awayWin: 0.2,
        homeScore: 1,
        awayScore: 0,
      },
      {
        matchId: 'duplicate',
        stage: 'group',
        sourceTier: 'official',
        rawConfidence: 0.61,
        homeWin: 0.25,
        draw: 0.25,
        awayWin: 0.5,
        homeScore: 0,
        awayScore: 2,
      },
      {
        matchId: 'unique',
        stage: 'final',
        sourceTier: 'verified_provider',
        rawConfidence: 0.63,
        homeWin: 0.25,
        draw: 0.3,
        awayWin: 0.45,
        homeScore: 1,
        awayScore: 1,
      },
    ]);

    expect(dataset.samples.map((sample) => sample.matchId)).toEqual(['duplicate', 'unique']);
    expect(dataset.audit).toEqual({
      totalRows: 3,
      acceptedRows: 2,
      rejectedRows: 1,
      rejectionReasons: {
        duplicate_match_id: 1,
      },
    });
  });

  it('builds a runnable historical backtest report from accepted rows only', () => {
    const backtest = runHistoricalWorldCupBacktest([
      {
        matchId: 'historical-home',
        stage: 'group',
        sourceTier: 'official',
        rawConfidence: 0.72,
        adjustedConfidence: 0.64,
        homeWin: 0.6,
        draw: 0.25,
        awayWin: 0.15,
        homeScore: 2,
        awayScore: 0,
      },
      {
        matchId: 'historical-away',
        stage: 'final',
        sourceTier: 'verified_provider',
        rawConfidence: 0.57,
        adjustedConfidence: 0.52,
        homeWin: 0.2,
        draw: 0.25,
        awayWin: 0.55,
        homeScore: 0,
        awayScore: 1,
      },
      {
        matchId: 'historical-home',
        stage: 'group',
        sourceTier: 'official',
        rawConfidence: 0.8,
        homeWin: 0.7,
        draw: 0.2,
        awayWin: 0.1,
        homeScore: 3,
        awayScore: 0,
      },
    ]);

    expect(backtest.dataset.audit.acceptedRows).toBe(2);
    expect(backtest.dataset.audit.rejectedRows).toBe(1);
    expect(backtest.dataset.audit.rejectionReasons).toEqual({
      duplicate_match_id: 1,
    });
    expect(backtest.report.overall.sampleSize).toBe(2);
    expect(backtest.report.bySourceTier.official?.count).toBe(1);
    expect(backtest.report.bySourceTier.verified_provider?.count).toBe(1);
  });

  it('parses historical CSV rows with aliases and quoted fields', () => {
    const csv = [
      'match_id,stage,source_tier,raw_confidence,adjusted_confidence,home_win,draw,away_win,home_score,away_score',
      '"csv,home",group,official,0.72,0.63,55,25,20,2,1',
      'csv-away,final,verified_provider,0.58,,20,25,55,0,1',
      '',
    ].join('\n');

    const parsed = parseHistoricalBacktestCsv(csv);

    expect(parsed).toEqual({
      rows: [
        {
          matchId: 'csv,home',
          stage: 'group',
          sourceTier: 'official',
          rawConfidence: '0.72',
          adjustedConfidence: '0.63',
          homeWin: '55',
          draw: '25',
          awayWin: '20',
          homeScore: '2',
          awayScore: '1',
        },
        {
          matchId: 'csv-away',
          stage: 'final',
          sourceTier: 'verified_provider',
          rawConfidence: '0.58',
          homeWin: '20',
          draw: '25',
          awayWin: '55',
          homeScore: '0',
          awayScore: '1',
        },
      ],
      audit: {
        totalRows: 2,
        acceptedRows: 2,
        rejectedRows: 0,
        rejectionReasons: {},
      },
    });
  });

  it('runs historical CSV backtests through CSV and domain audits', () => {
    const csv = [
      'match_id,stage,source_tier,raw_confidence,home_win,draw,away_win,home_score,away_score',
      'csv-home,group,official,0.72,55,25,20,2,1',
      'csv-away,final,verified_provider,0.58,20,25,55,0,1',
      'csv-home,group,official,0.8,70,20,10,3,0',
    ].join('\n');

    const backtest = runHistoricalWorldCupBacktestFromCsv(csv);

    expect(backtest.csv.audit).toEqual({
      totalRows: 3,
      acceptedRows: 3,
      rejectedRows: 0,
      rejectionReasons: {},
    });
    expect(backtest.dataset.audit).toEqual({
      totalRows: 3,
      acceptedRows: 2,
      rejectedRows: 1,
      rejectionReasons: {
        duplicate_match_id: 1,
      },
    });
    expect(backtest.report.overall.sampleSize).toBe(2);
  });

  it('rejects CSV rows whose column count does not match the header', () => {
    const parsed = parseHistoricalBacktestCsv([
      'match_id,stage,source_tier,raw_confidence,home_win,draw,away_win,home_score,away_score',
      'csv-home,group,official,0.72,55,25,20,2,1',
      'too-short,group,official,0.58,20,25,55',
      'too-long,final,official,0.58,20,25,55,0,1,extra',
    ].join('\n'));

    expect(parsed.rows).toEqual([
      {
        matchId: 'csv-home',
        stage: 'group',
        sourceTier: 'official',
        rawConfidence: '0.72',
        homeWin: '55',
        draw: '25',
        awayWin: '20',
        homeScore: '2',
        awayScore: '1',
      },
    ]);
    expect(parsed.audit).toEqual({
      totalRows: 3,
      acceptedRows: 1,
      rejectedRows: 2,
      rejectionReasons: {
        column_count_mismatch: 2,
      },
    });
  });

  it('reports invalid CSV input without throwing', () => {
    const parsed = parseHistoricalBacktestCsv('match_id,stage\n"unterminated,group');

    expect(parsed).toEqual({
      rows: [],
      audit: {
        totalRows: 0,
        acceptedRows: 0,
        rejectedRows: 1,
        rejectionReasons: {
          invalid_csv: 1,
        },
      },
    });
  });

  it('reports CSV files without recognized headers', () => {
    const parsed = parseHistoricalBacktestCsv([
      'fixture,round,confidence',
      'a,group,0.7',
      'b,final,0.5',
    ].join('\n'));

    expect(parsed).toEqual({
      rows: [],
      audit: {
        totalRows: 2,
        acceptedRows: 0,
        rejectedRows: 2,
        rejectionReasons: {
          missing_header: 2,
        },
      },
    });
  });

  it('summarizes a partial historical CSV import for presentation layers', () => {
    const backtest = runHistoricalWorldCupBacktestFromCsv([
      'match_id,stage,source_tier,raw_confidence,home_win,draw,away_win,home_score,away_score',
      'accepted,group,official,0.72,55,25,20,2,1',
      'accepted,group,official,0.8,70,20,10,3,0',
      'too-short,group,official,0.58,20,25,55',
    ].join('\n'));

    expect(summarizeHistoricalBacktestImport(backtest)).toEqual({
      status: 'partial',
      sampleSize: 1,
      acceptedRows: 1,
      rejectedRows: 2,
      csvRejectedRows: 1,
      datasetRejectedRows: 1,
      topRejectionReasons: [
        { scope: 'csv', reason: 'column_count_mismatch', count: 1 },
        { scope: 'dataset', reason: 'duplicate_match_id', count: 1 },
      ],
    });
  });

  it('summarizes blocked imports when no accepted backtest sample remains', () => {
    const backtest = runHistoricalWorldCupBacktestFromCsv('match_id,stage\n"unterminated,group');

    expect(summarizeHistoricalBacktestImport(backtest)).toEqual({
      status: 'blocked',
      sampleSize: 0,
      acceptedRows: 0,
      rejectedRows: 1,
      csvRejectedRows: 1,
      datasetRejectedRows: 0,
      topRejectionReasons: [
        { scope: 'csv', reason: 'invalid_csv', count: 1 },
      ],
    });
  });

  it('keeps the bundled local sample CSV as sample/provider evidence rather than official evidence', () => {
    const backtest = runHistoricalWorldCupBacktestFromCsv(LOCAL_SAMPLE_HISTORICAL_BACKTEST_CSV);

    expect(backtest.csv.audit).toEqual({
      totalRows: 4,
      acceptedRows: 4,
      rejectedRows: 0,
      rejectionReasons: {},
    });
    expect(backtest.dataset.audit).toEqual({
      totalRows: 4,
      acceptedRows: 3,
      rejectedRows: 1,
      rejectionReasons: {
        duplicate_match_id: 1,
      },
    });
    expect(backtest.report.quality.sourceCoverage).toEqual({
      official: { count: 0, coverage: 0 },
      verified_provider: { count: 1, coverage: 0.333333 },
      sample: { count: 1, coverage: 0.333333 },
      local: { count: 1, coverage: 0.333333 },
    });
    expect(backtest.report.quality.calibrationUsability).toEqual(expect.objectContaining({
      status: 'insufficient_non_sample',
      canUseForCalibration: false,
      sampleSize: 1,
    }));
  });
});
