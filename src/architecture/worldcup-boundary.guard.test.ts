import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

const collectSourceFiles = (directory: string): string[] => readdirSync(directory).flatMap((entry) => {
  const fullPath = join(directory, entry);
  if (statSync(fullPath).isDirectory()) return collectSourceFiles(fullPath);
  return /\.(ts|tsx)$/.test(entry) ? [relative(root, fullPath).replaceAll('\\', '/')] : [];
});

const allowedBoundaryFiles = new Set([
  'src/dataProviders/football/fixtureProvider.ts',
  'src/dataProviders/football/worldCupAdapter.ts',
  'src/dataProviders/football/teamMapper.ts',
  'src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts',
  'src/modules/sports/football/worldCup/domain/buildWorldCupDomain.ts',
  'src/server/worldCup/publicDataEndpoint.ts',
  'src/server/worldCup/predictionSnapshotJob.ts',
]);

const isProductionPath = (file: string) =>
  !file.endsWith('.test.ts') &&
  !file.endsWith('.test.tsx');

const sourceFiles = collectSourceFiles(join(root, 'src')).filter(isProductionPath);

const readSource = (file: string) => readFileSync(join(root, file), 'utf8');
const importSurface = (file: string) => readSource(file)
  .split('\n')
  .filter((line) => /^\s*import\s/.test(line) || /^\s*export\s+.*\sfrom\s/.test(line))
  .join('\n');

describe('World Cup architecture boundary', () => {
  it('has no parallel legacy World Cup implementation', () => {
    expect(sourceFiles.filter((file) => file.startsWith('src/legacy/worldcup/'))).toEqual([]);
  });

  it('keeps forbidden seed and legacy entrypoints out of production consumers', () => {
    const forbidden = [
      /data\/fixtures/,
      /teamsById/,
      /sampleOdds/,
      /getWorldCupMatches/,
      /useWorldCupMatches/,
      /dataProviders\/football/,
    ];

    const violations = sourceFiles.flatMap((file) => {
      if (allowedBoundaryFiles.has(file)) return [];
      const source = importSurface(file);
      return forbidden
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relative(root, join(root, file))}: ${pattern}`);
    });

    expect(violations).toEqual([]);
  });

  it('prevents sports UI from importing football data providers directly', () => {
    const uiFiles = sourceFiles.filter((file) =>
      file.startsWith('src/modules/sports/') &&
      !file.includes('/worldCup/domain/') &&
      !file.includes('/worldCup/hooks/useWorldCupDomain.ts')
    );

    const violations = uiFiles.filter((file) => /dataProviders\/football/.test(readSource(file)));
    expect(violations).toEqual([]);
  });

  it('keeps World Cup domain files free of UI and sample-data imports', () => {
    const domainFiles = sourceFiles.filter((file) => file.includes('/worldCup/domain/'));
    const forbidden = [
      /components\//,
      /WorldCupHome/,
      /data\/fixtures/,
      /data\/sampleOdds/,
      /data\/teams/,
      /teamsById/,
    ];

    const violations = domainFiles.flatMap((file) => {
      const source = readSource(file);
      return forbidden
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relative(root, join(root, file))}: ${pattern}`);
    });

    expect(violations).toEqual([]);
  });

  it('keeps Prediction V2 deterministic and domain timestamps input-derived', () => {
    const predictionSource = readSource('src/modules/sports/football/worldCup/logic/predictionEngine.ts');
    const domainBuilderSource = readSource('src/modules/sports/football/worldCup/domain/buildWorldCupDomain.ts');

    expect(predictionSource).not.toMatch(/Math\.random|Date\.now|new Date\(/);
    expect(predictionSource).toContain("modelVersion: 'v2'");
    expect(domainBuilderSource).not.toContain('Date.now');
    expect(domainBuilderSource).toContain('deriveLastUpdated');
  });
});
