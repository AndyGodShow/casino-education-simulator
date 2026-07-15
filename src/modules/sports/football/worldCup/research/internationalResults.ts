export type InternationalResult = {
  id: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  tournament: string;
  city: string;
  country: string;
  neutral: boolean;
  source: 'martj42-international-results';
  retrievedAt: string;
};

type InternationalResultsRejectionReason =
  | 'missing_header'
  | 'invalid_csv'
  | 'invalid_date'
  | 'invalid_team'
  | 'invalid_score'
  | 'invalid_neutral'
  | 'duplicate'
  | 'future_or_same_day';

export type InternationalResultsDataset = {
  results: InternationalResult[];
  audit: {
    totalRows: number;
    acceptedRows: number;
    rejectedRows: number;
    rejectionReasons: Partial<Record<InternationalResultsRejectionReason, number>>;
  };
};

type ParseInternationalResultsOptions = {
  evaluationTimeMs: number;
  retrievedAt: string;
};

const requiredHeaders = [
  'date',
  'home_team',
  'away_team',
  'home_score',
  'away_score',
  'tournament',
  'city',
  'country',
  'neutral',
] as const;

const parseCsvRecords = (csv: string): string[][] | null => {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    const next = csv[index + 1];

    if (character === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === ',' && !quoted) {
      record.push(field);
      field = '';
      continue;
    }

    if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      record.push(field);
      if (record.some((value) => value.trim())) records.push(record);
      record = [];
      field = '';
      continue;
    }

    field += character;
  }

  if (quoted) return null;
  record.push(field);
  if (record.some((value) => value.trim())) records.push(record);
  return records;
};

const increment = (
  reasons: InternationalResultsDataset['audit']['rejectionReasons'],
  reason: InternationalResultsRejectionReason,
) => {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
};

const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const parseScore = (value: string) => {
  const score = Number(value);
  return Number.isInteger(score) && score >= 0 ? score : null;
};

const parseNeutral = (value: string) => {
  if (value.toUpperCase() === 'TRUE') return true;
  if (value.toUpperCase() === 'FALSE') return false;
  return null;
};

const normalizeText = (value: string) => value.normalize('NFC').replace(/\s+/g, ' ').trim();

const slug = (value: string) => value
  .normalize('NFKD')
  .replace(/\p{Diacritic}/gu, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

export function parseInternationalResultsCsv(
  csv: string,
  options: ParseInternationalResultsOptions,
): InternationalResultsDataset {
  const records = parseCsvRecords(csv);
  const rejectionReasons: InternationalResultsDataset['audit']['rejectionReasons'] = {};
  if (!records) {
    return {
      results: [],
      audit: {
        totalRows: 0,
        acceptedRows: 0,
        rejectedRows: 1,
        rejectionReasons: { invalid_csv: 1 },
      },
    };
  }

  const [header, ...rows] = records;
  const headerIndexes = new Map((header ?? []).map((value, index) => [value.trim(), index]));
  if (!header || requiredHeaders.some((name) => !headerIndexes.has(name))) {
    return {
      results: [],
      audit: {
        totalRows: rows.length,
        acceptedRows: 0,
        rejectedRows: Math.max(1, rows.length),
        rejectionReasons: { missing_header: Math.max(1, rows.length) },
      },
    };
  }

  const valueAt = (row: string[], name: (typeof requiredHeaders)[number]) =>
    normalizeText(row[headerIndexes.get(name) ?? -1] ?? '');
  const evaluationDate = new Date(options.evaluationTimeMs).toISOString().slice(0, 10);
  const seen = new Set<string>();
  const results: InternationalResult[] = [];

  for (const row of rows) {
    const date = valueAt(row, 'date');
    const homeTeam = valueAt(row, 'home_team');
    const awayTeam = valueAt(row, 'away_team');
    const tournament = valueAt(row, 'tournament');
    const homeScore = parseScore(valueAt(row, 'home_score'));
    const awayScore = parseScore(valueAt(row, 'away_score'));
    const neutral = parseNeutral(valueAt(row, 'neutral'));

    if (!validDate(date)) {
      increment(rejectionReasons, 'invalid_date');
      continue;
    }
    if (date >= evaluationDate) {
      increment(rejectionReasons, 'future_or_same_day');
      continue;
    }
    if (!homeTeam || !awayTeam || homeTeam === awayTeam) {
      increment(rejectionReasons, 'invalid_team');
      continue;
    }
    if (homeScore === null || awayScore === null) {
      increment(rejectionReasons, 'invalid_score');
      continue;
    }
    if (neutral === null) {
      increment(rejectionReasons, 'invalid_neutral');
      continue;
    }

    const id = `${date}:${slug(homeTeam)}:${slug(awayTeam)}:${slug(tournament)}`;
    if (seen.has(id)) {
      increment(rejectionReasons, 'duplicate');
      continue;
    }
    seen.add(id);
    results.push({
      id,
      date,
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      tournament,
      city: valueAt(row, 'city'),
      country: valueAt(row, 'country'),
      neutral,
      source: 'martj42-international-results',
      retrievedAt: options.retrievedAt,
    });
  }

  return {
    results,
    audit: {
      totalRows: rows.length,
      acceptedRows: results.length,
      rejectedRows: rows.length - results.length,
      rejectionReasons,
    },
  };
}
