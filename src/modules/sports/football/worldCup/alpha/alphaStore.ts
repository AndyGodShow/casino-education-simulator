import type { AlphaSignals } from '../logic/signalLayer';
import type { ExpectedGoals } from '../logic/predictionEngine';
import type { SignalWeights } from './alphaCalibration';

export type MatchOutcome = 'home' | 'draw' | 'away';

export type OneX2Probability = {
  homeWin: number;
  draw: number;
  awayWin: number;
};

export interface AlphaRecord {
  matchId: string;
  alpha?: OneX2Probability;
  alphaHomeWin: number;
  alphaDraw: number;
  alphaAwayWin: number;
  baseline?: {
    oneX2: OneX2Probability;
    lambda: ExpectedGoals;
  };
  signalModel?: {
    oneX2: OneX2Probability;
    lambda: ExpectedGoals;
  };
  signals?: AlphaSignals;
  weights?: SignalWeights;
  /** The outcome with highest baseline probability */
  predictedOutcome: MatchOutcome;
  /** Set when match result is known */
  actualOutcome?: MatchOutcome;
  /** Timestamp when the record was created */
  createdAt: number;
  /** Timestamp when the result was resolved */
  resolvedAt?: number;
}

export const MAX_ALPHA_RECORDS = 1000;

export type AlphaStore = {
  append(record: Omit<AlphaRecord, 'createdAt'>): void;
  resolve(matchId: string, homeScore: number, awayScore: number): void;
  getAll(): ReadonlyArray<Readonly<AlphaRecord>>;
  getResolved(): ReadonlyArray<Readonly<AlphaRecord>>;
  getByMatchId(matchId: string): Readonly<AlphaRecord> | undefined;
  size(): number;
  resolvedSize(): number;
  reset(): void;
};

export function createAlphaStore(options: { maxRecords?: number } = {}): AlphaStore {
  const maxRecords = Math.max(1, Math.floor(options.maxRecords ?? MAX_ALPHA_RECORDS));
  const store: AlphaRecord[] = [];

  const append = (record: Omit<AlphaRecord, 'createdAt'>) => {
    const existing = store.findIndex((r) => r.matchId === record.matchId);
    const alpha = record.alpha ?? {
      homeWin: record.alphaHomeWin,
      draw: record.alphaDraw,
      awayWin: record.alphaAwayWin,
    };
    const entry: AlphaRecord = {
      ...record,
      alpha,
      alphaHomeWin: alpha.homeWin,
      alphaDraw: alpha.draw,
      alphaAwayWin: alpha.awayWin,
      createdAt: Date.now(),
    };

    if (existing >= 0) {
      store[existing] = entry;
      return;
    }

    store.push(entry);
    while (store.length > maxRecords) {
      store.shift();
    }
  };

  const resolve = (matchId: string, homeScore: number, awayScore: number) => {
    const entry = store.find((r) => r.matchId === matchId);
    if (!entry) return;

    if (homeScore > awayScore) {
      entry.actualOutcome = 'home';
    } else if (homeScore < awayScore) {
      entry.actualOutcome = 'away';
    } else {
      entry.actualOutcome = 'draw';
    }
    entry.resolvedAt = Date.now();
  };

  const getResolved = () => store.filter((r) => r.actualOutcome !== undefined);

  return {
    append,
    resolve,
    getAll: () => store,
    getResolved,
    getByMatchId: (matchId: string) => store.find((r) => r.matchId === matchId),
    size: () => store.length,
    resolvedSize: () => getResolved().length,
    reset: () => {
      store.length = 0;
    },
  };
}

export const defaultAlphaStore = createAlphaStore();

export function record(record: Omit<AlphaRecord, 'createdAt'>): void {
  defaultAlphaStore.append(record);
}

export function resolve(matchId: string, homeScore: number, awayScore: number): void {
  defaultAlphaStore.resolve(matchId, homeScore, awayScore);
}

export function getAll(): ReadonlyArray<Readonly<AlphaRecord>> {
  return defaultAlphaStore.getAll();
}

export function getResolved(): ReadonlyArray<Readonly<AlphaRecord>> {
  return defaultAlphaStore.getResolved();
}

export function getByMatchId(matchId: string): Readonly<AlphaRecord> | undefined {
  return defaultAlphaStore.getByMatchId(matchId);
}

export function count(): number {
  return defaultAlphaStore.size();
}

export function countResolved(): number {
  return defaultAlphaStore.resolvedSize();
}

export function reset(): void {
  defaultAlphaStore.reset();
}
