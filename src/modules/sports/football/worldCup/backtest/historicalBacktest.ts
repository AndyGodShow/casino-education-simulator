import { normalizeThreeWay } from '../../../../core/probability/unifiedProbability';
import { outcomeFromScore } from '../logic/matchOutcome';
import type { WorldCupMatch } from '../types';
import { runWorldCupBacktest } from './worldCupBacktest';
import type { WorldCupBacktestReport, WorldCupBacktestSample, WorldCupBacktestSourceTier } from './types';

export type HistoricalBacktestRow = {
  matchId?: unknown;
  stage?: unknown;
  sourceTier?: unknown;
  rawConfidence?: unknown;
  adjustedConfidence?: unknown;
  homeWin?: unknown;
  draw?: unknown;
  awayWin?: unknown;
  homeScore?: unknown;
  awayScore?: unknown;
};

export type HistoricalBacktestRejectionReason =
  | 'missing_match_id'
  | 'duplicate_match_id'
  | 'invalid_stage'
  | 'invalid_source_tier'
  | 'invalid_confidence'
  | 'invalid_probability'
  | 'invalid_score';

export type HistoricalBacktestAudit = {
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  rejectionReasons: Partial<Record<HistoricalBacktestRejectionReason, number>>;
};

export type HistoricalBacktestDataset = {
  samples: WorldCupBacktestSample[];
  audit: HistoricalBacktestAudit;
};

export type HistoricalBacktestCsvRejectionReason =
  | 'missing_header'
  | 'invalid_csv'
  | 'column_count_mismatch';

export type HistoricalBacktestCsvAudit = {
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  rejectionReasons: Partial<Record<HistoricalBacktestCsvRejectionReason, number>>;
};

export type HistoricalBacktestCsvParse = {
  rows: HistoricalBacktestRow[];
  audit: HistoricalBacktestCsvAudit;
};

export type HistoricalBacktestRun = {
  dataset: HistoricalBacktestDataset;
  report: WorldCupBacktestReport;
};

export type HistoricalBacktestCsvRun = HistoricalBacktestRun & {
  csv: HistoricalBacktestCsvParse;
};

export type HistoricalBacktestImportSummary = {
  status: 'ready' | 'partial' | 'blocked';
  sampleSize: number;
  acceptedRows: number;
  rejectedRows: number;
  csvRejectedRows: number;
  datasetRejectedRows: number;
  topRejectionReasons: Array<{
    scope: 'csv' | 'dataset';
    reason: HistoricalBacktestCsvRejectionReason | HistoricalBacktestRejectionReason;
    count: number;
  }>;
};

const csvRejectionReasonLabels = {
  column_count_mismatch: 'CSV 列数不匹配',
  invalid_csv: 'CSV 格式非法',
  missing_header: '缺少可识别表头',
} satisfies Record<HistoricalBacktestCsvRejectionReason, string>;

const datasetRejectionReasonLabels = {
  duplicate_match_id: '重复比赛 ID',
  invalid_confidence: '置信度非法',
  invalid_probability: '概率非法',
  invalid_score: '比分非法',
  invalid_source_tier: '来源层级非法',
  invalid_stage: '赛事阶段非法',
  missing_match_id: '缺少比赛 ID',
} satisfies Record<HistoricalBacktestRejectionReason, string>;

export function formatHistoricalBacktestRejectionReason(
  entry: HistoricalBacktestImportSummary['topRejectionReasons'][number],
) {
  return entry.scope === 'csv'
    ? csvRejectionReasonLabels[entry.reason as HistoricalBacktestCsvRejectionReason]
    : datasetRejectionReasonLabels[entry.reason as HistoricalBacktestRejectionReason];
}

const validStages = new Set<WorldCupMatch['stage']>([
  'group',
  'round32',
  'round16',
  'quarter',
  'semi',
  'thirdPlace',
  'final',
]);

const validSourceTiers = new Set<WorldCupBacktestSourceTier>([
  'official',
  'verified_provider',
  'sample',
  'local',
]);

const toNumber = (value: unknown) => {
  if (typeof value === 'string' && !value.trim()) return null;
  const number = typeof value === 'string' ? Number(value.trim()) : Number(value);
  return Number.isFinite(number) ? number : null;
};

const normalizeRatioValue = (value: unknown) => {
  const number = typeof value === 'string' && value.trim().endsWith('%')
    ? Number(value.trim().slice(0, -1)) / 100
    : toNumber(value);
  if (number === null || number < 0) return null;
  if (number > 1 && number < 2) return number;
  return number >= 2 ? number / 100 : number;
};

const normalizeProbabilityValue = normalizeRatioValue;
const normalizeConfidenceValue = normalizeRatioValue;

const isValidConfidence = (value: number | null): value is number =>
  value !== null && value >= 0 && value <= 1;

const isValidScore = (value: number | null): value is number =>
  value !== null && Number.isInteger(value) && value >= 0;

const reject = (
  reasons: Partial<Record<HistoricalBacktestRejectionReason, number>>,
  reason: HistoricalBacktestRejectionReason,
) => {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
};

const parseRow = (
  row: HistoricalBacktestRow,
  rejectionReasons: Partial<Record<HistoricalBacktestRejectionReason, number>>,
): WorldCupBacktestSample | null => {
  const matchId = typeof row.matchId === 'string' ? row.matchId.trim() : '';
  if (!matchId) {
    reject(rejectionReasons, 'missing_match_id');
    return null;
  }

  const stage = row.stage;
  if (typeof stage !== 'string' || !validStages.has(stage as WorldCupMatch['stage'])) {
    reject(rejectionReasons, 'invalid_stage');
    return null;
  }

  const sourceTier = row.sourceTier;
  if (typeof sourceTier !== 'string' || !validSourceTiers.has(sourceTier as WorldCupBacktestSourceTier)) {
    reject(rejectionReasons, 'invalid_source_tier');
    return null;
  }

  const rawConfidence = normalizeConfidenceValue(row.rawConfidence);
  const adjustedConfidence = row.adjustedConfidence === undefined
    ? rawConfidence
    : normalizeConfidenceValue(row.adjustedConfidence);
  if (!isValidConfidence(rawConfidence) || !isValidConfidence(adjustedConfidence)) {
    reject(rejectionReasons, 'invalid_confidence');
    return null;
  }

  const home = normalizeProbabilityValue(row.homeWin);
  const draw = normalizeProbabilityValue(row.draw);
  const away = normalizeProbabilityValue(row.awayWin);
  if (
    home === null
    || draw === null
    || away === null
    || home > 1
    || draw > 1
    || away > 1
    || home + draw + away <= 0
  ) {
    reject(rejectionReasons, 'invalid_probability');
    return null;
  }

  const homeScore = toNumber(row.homeScore);
  const awayScore = toNumber(row.awayScore);
  if (!isValidScore(homeScore) || !isValidScore(awayScore)) {
    reject(rejectionReasons, 'invalid_score');
    return null;
  }

  return {
    matchId,
    stage: stage as WorldCupMatch['stage'],
    sourceTier: sourceTier as WorldCupBacktestSourceTier,
    rawConfidence,
    adjustedConfidence,
    probabilities: normalizeThreeWay({ home, draw, away }),
    outcome: outcomeFromScore(homeScore, awayScore),
  };
};

export function buildHistoricalBacktestDataset(rows: HistoricalBacktestRow[]): HistoricalBacktestDataset {
  const rejectionReasons: HistoricalBacktestAudit['rejectionReasons'] = {};
  const seenMatchIds = new Set<string>();
  const samples = rows.flatMap((row) => {
    const sample = parseRow(row, rejectionReasons);
    if (!sample) return [];
    if (seenMatchIds.has(sample.matchId)) {
      reject(rejectionReasons, 'duplicate_match_id');
      return [];
    }

    seenMatchIds.add(sample.matchId);
    return [sample];
  });

  return {
    samples,
    audit: {
      totalRows: rows.length,
      acceptedRows: samples.length,
      rejectedRows: rows.length - samples.length,
      rejectionReasons,
    },
  };
}

export function runHistoricalWorldCupBacktest(rows: HistoricalBacktestRow[]): HistoricalBacktestRun {
  const dataset = buildHistoricalBacktestDataset(rows);
  return {
    dataset,
    report: runWorldCupBacktest(dataset.samples),
  };
}

const csvHeaderAliases: Record<string, keyof HistoricalBacktestRow> = {
  adjustedconfidence: 'adjustedConfidence',
  awaywin: 'awayWin',
  awayscore: 'awayScore',
  draw: 'draw',
  homewin: 'homeWin',
  homescore: 'homeScore',
  matchid: 'matchId',
  rawconfidence: 'rawConfidence',
  sourcetier: 'sourceTier',
  stage: 'stage',
};

const normalizeCsvHeader = (header: string) => header.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const parseCsvRecords = (csv: string): string[][] | null => {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];

    if (inQuotes) {
      if (char === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      if (field.length > 0) return null;
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      records.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (inQuotes) return null;
  row.push(field);
  records.push(row);

  return records.filter((record) => record.some((cell) => cell.trim()));
};

const csvAudit = (
  totalRows: number,
  acceptedRows: number,
  rejectedRows: number,
  rejectionReasons: HistoricalBacktestCsvAudit['rejectionReasons'] = {},
): HistoricalBacktestCsvAudit => ({
  totalRows,
  acceptedRows,
  rejectedRows,
  rejectionReasons,
});

const rejectCsv = (
  reasons: Partial<Record<HistoricalBacktestCsvRejectionReason, number>>,
  reason: HistoricalBacktestCsvRejectionReason,
) => {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
};

export function parseHistoricalBacktestCsv(csv: string): HistoricalBacktestCsvParse {
  const records = parseCsvRecords(csv);
  if (!records) {
    return {
      rows: [],
      audit: csvAudit(0, 0, 1, { invalid_csv: 1 }),
    };
  }

  const [headers, ...dataRows] = records;
  if (!headers) {
    return {
      rows: [],
      audit: csvAudit(0, 0, 1, { missing_header: 1 }),
    };
  }

  const keys = headers.map((header) => csvHeaderAliases[normalizeCsvHeader(header)]);
  if (!keys.some(Boolean)) {
    const rejectedRows = Math.max(1, dataRows.length);
    return {
      rows: [],
      audit: csvAudit(dataRows.length, 0, rejectedRows, { missing_header: rejectedRows }),
    };
  }

  const rejectionReasons: HistoricalBacktestCsvAudit['rejectionReasons'] = {};
  const rows = dataRows.flatMap((record) => {
    if (record.length !== headers.length) {
      rejectCsv(rejectionReasons, 'column_count_mismatch');
      return [];
    }

    const row: HistoricalBacktestRow = {};
    keys.forEach((key, index) => {
      if (!key) return;
      const value = record[index]?.trim();
      if (value) row[key] = value;
    });
    return [row];
  });
  const rejectedRows = dataRows.length - rows.length;

  return {
    rows,
    audit: csvAudit(dataRows.length, rows.length, rejectedRows, rejectionReasons),
  };
}

export function runHistoricalWorldCupBacktestFromCsv(csv: string): HistoricalBacktestCsvRun {
  const parsed = parseHistoricalBacktestCsv(csv);
  const backtest = runHistoricalWorldCupBacktest(parsed.rows);

  return {
    csv: parsed,
    ...backtest,
  };
}

const rejectionEntries = <Reason extends string>(
  scope: 'csv' | 'dataset',
  reasons: Partial<Record<Reason, number>>,
) => Object.entries(reasons)
  .map(([reason, count]) => ({
    scope,
    reason: reason as Reason,
    count: typeof count === 'number' ? count : 0,
  }))
  .filter((entry) => entry.count > 0);

export function summarizeHistoricalBacktestImport(
  run: HistoricalBacktestRun | HistoricalBacktestCsvRun,
): HistoricalBacktestImportSummary {
  const csv = 'csv' in run ? run.csv.audit : null;
  const csvRejectedRows = csv?.rejectedRows ?? 0;
  const datasetRejectedRows = run.dataset.audit.rejectedRows;
  const sampleSize = run.report.overall.sampleSize;
  const rejectedRows = csvRejectedRows + datasetRejectedRows;
  const topRejectionReasons = [
    ...(csv ? rejectionEntries('csv', csv.rejectionReasons) : []),
    ...rejectionEntries('dataset', run.dataset.audit.rejectionReasons),
  ].sort((left, right) => right.count - left.count);

  return {
    status: sampleSize === 0 ? 'blocked' : rejectedRows > 0 ? 'partial' : 'ready',
    sampleSize,
    acceptedRows: run.dataset.audit.acceptedRows,
    rejectedRows,
    csvRejectedRows,
    datasetRejectedRows,
    topRejectionReasons,
  };
}
