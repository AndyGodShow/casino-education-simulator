import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT_PATH = join(process.cwd(), 'scripts/check-build-budget.mjs');
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('frontend build budget policy', () => {
  it('passes a build inside every budget and reports measured groups', () => {
    const root = createBuild();

    const result = runBudget(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Initial JavaScript:');
    expect(result.stdout).toContain('World Cup route JavaScript:');
    expect(result.stdout).toContain('Largest JavaScript chunk:');
    expect(result.stdout).toContain('Largest CSS asset:');
    expect(result.stdout).toContain('Largest raster asset:');
  });

  it.each([
    ['initial JavaScript', { initialKiB: 71 }, 'Initial JavaScript'],
    ['World Cup route JavaScript', { worldCupKiB: 95, vendorKiB: 95 }, 'World Cup route JavaScript'],
    ['single JavaScript chunk', { extraChunkKiB: 121 }, 'JavaScript chunk assets/extra.js'],
    ['single CSS asset', { cssKiB: 11 }, 'CSS asset assets/world-cup.css'],
    ['single raster asset', { rasterKiB: 351 }, 'Raster asset assets/hero.png'],
  ])('rejects an oversized %s', (_label, sizes, expectedMessage) => {
    const root = createBuild(sizes);

    const result = runBudget(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(expectedMessage);
    expect(result.stderr).not.toContain(root);
  });

  it('reports a missing manifest asset without exposing the workspace path', () => {
    const root = createBuild();
    rmSync(join(root, 'dist', 'assets', 'index.js'));

    const result = runBudget(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Build asset assets/index.js is missing.');
    expect(result.stderr).not.toContain(root);
  });

  it('rejects traditional game entries whose chunk names are not observable', () => {
    const root = createBuild({ genericGameChunks: true });

    const result = runBudget(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Baccarat dynamic entry must use an identifiable baccarat chunk name.');
    expect(result.stderr).toContain('Blackjack dynamic entry must use an identifiable blackjack chunk name.');
    expect(result.stderr).toContain('Roulette dynamic entry must use an identifiable roulette chunk name.');
    expect(result.stderr).not.toContain(root);
  });
});

type BuildSizes = {
  initialKiB?: number;
  worldCupKiB?: number;
  vendorKiB?: number;
  extraChunkKiB?: number;
  cssKiB?: number;
  rasterKiB?: number;
  genericGameChunks?: boolean;
};

const createBuild = (sizes: BuildSizes = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'build-budget-'));
  roots.push(root);
  const dist = join(root, 'dist');
  mkdirSync(join(dist, '.vite'), { recursive: true });
  mkdirSync(join(dist, 'assets'), { recursive: true });
  const gameFile = (gameId: string, genericIndex: number) => sizes.genericGameChunks
    ? `assets/index-${genericIndex}.js`
    : `assets/${gameId}-${genericIndex}.js`;
  const gameEntries = {
    'src/modules/traditional/games/baccarat/index.ts': {
      file: gameFile('baccarat', 1),
      isDynamicEntry: true,
    },
    'src/modules/traditional/games/blackjack/index.ts': {
      file: gameFile('blackjack', 2),
      isDynamicEntry: true,
    },
    'src/modules/traditional/games/roulette/index.ts': {
      file: gameFile('roulette', 3),
      isDynamicEntry: true,
    },
  };
  writeFileSync(join(dist, '.vite', 'manifest.json'), JSON.stringify({
    'index.html': {
      file: 'assets/index.js',
      isEntry: true,
      imports: [],
    },
    'src/modules/sports/football/worldCup/WorldCupHome.tsx': {
      file: 'assets/world-cup.js',
      isDynamicEntry: true,
      imports: ['_world-cup-vendor.js'],
      css: ['assets/world-cup.css'],
    },
    '_world-cup-vendor.js': {
      file: 'assets/world-cup-vendor.js',
    },
    ...gameEntries,
  }));
  writePseudoRandomFile(join(dist, 'assets', 'index.js'), sizes.initialKiB ?? 10);
  writePseudoRandomFile(join(dist, 'assets', 'world-cup.js'), sizes.worldCupKiB ?? 10);
  writePseudoRandomFile(join(dist, 'assets', 'world-cup-vendor.js'), sizes.vendorKiB ?? 10);
  writePseudoRandomFile(join(dist, 'assets', 'world-cup.css'), sizes.cssKiB ?? 5);
  writePseudoRandomFile(join(dist, 'assets', 'hero.png'), sizes.rasterKiB ?? 10);
  for (const entry of Object.values(gameEntries)) {
    writePseudoRandomFile(join(dist, entry.file), 1);
  }
  if (sizes.extraChunkKiB) {
    writePseudoRandomFile(join(dist, 'assets', 'extra.js'), sizes.extraChunkKiB);
  }
  return root;
};

const writePseudoRandomFile = (path: string, sizeKiB: number) => {
  let state = 0x12345678;
  const bytes = Buffer.alloc(sizeKiB * 1_024);
  for (let index = 0; index < bytes.length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[index] = state & 0xff;
  }
  writeFileSync(path, bytes);
};

const runBudget = (root: string) => spawnSync(
  process.execPath,
  [SCRIPT_PATH, '--root', root],
  { encoding: 'utf8' },
);
