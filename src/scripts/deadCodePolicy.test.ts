import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

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
  it('completed dead-code batches do not reappear', () => {
    const issues = runKnip();
    const removedSymbolsStillReported = issues.flatMap((issue) => {
      const removed = new Set(REMOVED_EXPORT_SURFACE[issue.file] ?? []);
      return reportedSymbols(issue)
        .filter((name) => removed.has(name))
        .map((name) => `${issue.file}:${name}`);
    });

    expect(removedSymbolsStillReported).toEqual([]);
  });

  it('Knip has no remaining issues', () => {
    const reportedIssues = runKnip().flatMap((issue) =>
      Object.entries(issue).flatMap(([collection, values]) => {
        if (collection === 'file' || !Array.isArray(values)) return [];
        return values.map((value) => `${issue.file}:${collection}:${JSON.stringify(value)}`);
      }),
    );

    expect(reportedIssues).toEqual([]);
  });
});
