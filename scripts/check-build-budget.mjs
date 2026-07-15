import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const KIB = 1_024;
const BUDGETS = {
  initialJavaScriptGzip: 70 * KIB,
  worldCupJavaScriptGzip: 90 * KIB,
  javascriptChunkGzip: 120 * KIB,
  cssAssetGzip: 10 * KIB,
  rasterAssetRaw: 350 * KIB,
};
const RASTER_EXTENSIONS = /\.(?:avif|gif|jpe?g|png|webp)$/i;
const OBSERVABLE_TRADITIONAL_GAME_CHUNKS = [
  { label: 'Baccarat', gameId: 'baccarat' },
  { label: 'Blackjack', gameId: 'blackjack' },
  { label: 'Roulette', gameId: 'roulette' },
];

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const rootFlagIndex = process.argv.indexOf('--root');
const projectRoot = rootFlagIndex >= 0
  ? process.argv[rootFlagIndex + 1]
  : join(scriptDirectory, '..');
const distDirectory = join(projectRoot, 'dist');
const manifestPath = join(distDirectory, '.vite', 'manifest.json');

const formatKiB = (bytes) => `${(bytes / KIB).toFixed(2)} KiB`;
const relativeAsset = (path) => relative(distDirectory, path).split(sep).join('/');

const safeAssetPath = (asset) => {
  if (
    typeof asset !== 'string'
    || isAbsolute(asset)
    || asset.split(/[\\/]/).includes('..')
  ) {
    throw new Error('Build manifest contains an invalid asset path.');
  }
  return join(distDirectory, asset);
};

const readGzipSize = (asset) => {
  const path = safeAssetPath(asset);
  if (!existsSync(path)) throw new Error(`Build asset ${asset} is missing.`);
  return gzipSync(readFileSync(path)).byteLength;
};

const collectFiles = (directory) => {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(path));
    if (entry.isFile()) files.push(path);
  }
  return files;
};

const collectJavaScriptGraph = (manifest, entryKey, visited = new Set()) => {
  if (visited.has(entryKey)) return new Set();
  visited.add(entryKey);
  const entry = manifest[entryKey];
  if (!entry || typeof entry !== 'object') {
    throw new Error(`Build manifest references missing entry ${entryKey}.`);
  }

  const assets = new Set();
  if (typeof entry.file === 'string' && entry.file.endsWith('.js')) {
    assets.add(entry.file);
  }
  for (const importedKey of Array.isArray(entry.imports) ? entry.imports : []) {
    for (const asset of collectJavaScriptGraph(manifest, importedKey, visited)) {
      assets.add(asset);
    }
  }
  return assets;
};

const sumGzip = (assets) => {
  let total = 0;
  for (const asset of assets) total += readGzipSize(asset);
  return total;
};

const fail = (violations) => {
  console.error('Build budget failed:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
};

if (!projectRoot || !existsSync(manifestPath)) {
  fail(['Build manifest is missing. Run npm run build first.']);
} else {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const entries = Object.entries(manifest);
    const initialEntry = entries.find(([, entry]) => entry?.isEntry === true);
    const worldCupEntry = entries.find(([key, entry]) =>
      key.endsWith('/worldCup/WorldCupHome.tsx')
      || entry?.src?.endsWith('/worldCup/WorldCupHome.tsx'));
    if (!initialEntry) throw new Error('Build manifest has no initial entry.');
    if (!worldCupEntry) throw new Error('Build manifest has no World Cup route entry.');

    const initialAssets = collectJavaScriptGraph(manifest, initialEntry[0]);
    const worldCupAssets = collectJavaScriptGraph(manifest, worldCupEntry[0]);
    for (const asset of initialAssets) worldCupAssets.delete(asset);

    const initialGzip = sumGzip(initialAssets);
    const worldCupGzip = sumGzip(worldCupAssets);
    const allFiles = collectFiles(distDirectory)
      .filter((path) => !path.includes(`${sep}.vite${sep}`));
    const javascript = allFiles
      .filter((path) => path.endsWith('.js'))
      .map((path) => ({ path, size: gzipSync(readFileSync(path)).byteLength }));
    const css = allFiles
      .filter((path) => path.endsWith('.css'))
      .map((path) => ({ path, size: gzipSync(readFileSync(path)).byteLength }));
    const rasters = allFiles
      .filter((path) => RASTER_EXTENSIONS.test(path))
      .map((path) => ({ path, size: statSync(path).size }));
    const largestJavaScript = javascript.toSorted((a, b) => b.size - a.size)[0];
    const largestCss = css.toSorted((a, b) => b.size - a.size)[0];
    const largestRaster = rasters.toSorted((a, b) => b.size - a.size)[0];

    console.log(`Initial JavaScript: ${formatKiB(initialGzip)} / 70.00 KiB gzip`);
    console.log(`World Cup route JavaScript: ${formatKiB(worldCupGzip)} / 90.00 KiB gzip`);
    console.log(`Largest JavaScript chunk: ${largestJavaScript ? `${relativeAsset(largestJavaScript.path)} ${formatKiB(largestJavaScript.size)}` : 'none'} / 120.00 KiB gzip`);
    console.log(`Largest CSS asset: ${largestCss ? `${relativeAsset(largestCss.path)} ${formatKiB(largestCss.size)}` : 'none'} / 10.00 KiB gzip`);
    console.log(`Largest raster asset: ${largestRaster ? `${relativeAsset(largestRaster.path)} ${formatKiB(largestRaster.size)}` : 'none'} / 350.00 KiB raw`);

    const violations = [];
    for (const { label, gameId } of OBSERVABLE_TRADITIONAL_GAME_CHUNKS) {
      const sourceSuffix = `/modules/traditional/games/${gameId}/index.ts`;
      const dynamicEntry = entries.find(([key, entry]) =>
        key.replaceAll('\\', '/').endsWith(sourceSuffix)
        || entry?.src?.replaceAll('\\', '/').endsWith(sourceSuffix));
      const observableFilePattern = new RegExp(`(?:^|/)${gameId}(?:-[A-Za-z0-9_-]+)?\\.js$`);
      if (!dynamicEntry || !observableFilePattern.test(dynamicEntry[1]?.file ?? '')) {
        violations.push(`${label} dynamic entry must use an identifiable ${gameId} chunk name.`);
      }
    }
    if (initialGzip > BUDGETS.initialJavaScriptGzip) {
      violations.push(`Initial JavaScript is ${formatKiB(initialGzip)} (limit ${formatKiB(BUDGETS.initialJavaScriptGzip)} gzip).`);
    }
    if (worldCupGzip > BUDGETS.worldCupJavaScriptGzip) {
      violations.push(`World Cup route JavaScript is ${formatKiB(worldCupGzip)} (limit ${formatKiB(BUDGETS.worldCupJavaScriptGzip)} gzip).`);
    }
    for (const asset of javascript) {
      if (asset.size > BUDGETS.javascriptChunkGzip) {
        violations.push(`JavaScript chunk ${relativeAsset(asset.path)} is ${formatKiB(asset.size)} (limit ${formatKiB(BUDGETS.javascriptChunkGzip)} gzip).`);
      }
    }
    for (const asset of css) {
      if (asset.size > BUDGETS.cssAssetGzip) {
        violations.push(`CSS asset ${relativeAsset(asset.path)} is ${formatKiB(asset.size)} (limit ${formatKiB(BUDGETS.cssAssetGzip)} gzip).`);
      }
    }
    for (const asset of rasters) {
      if (asset.size > BUDGETS.rasterAssetRaw) {
        violations.push(`Raster asset ${relativeAsset(asset.path)} is ${formatKiB(asset.size)} (limit ${formatKiB(BUDGETS.rasterAssetRaw)} raw).`);
      }
    }
    if (violations.length > 0) fail(violations);
  } catch (error) {
    fail([error instanceof Error ? error.message : 'Build budget check failed.']);
  }
}
