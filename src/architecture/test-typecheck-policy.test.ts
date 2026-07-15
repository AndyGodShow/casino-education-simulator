import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('test typecheck policy', () => {
  it('strictly compiles unit and E2E tests through the standard typecheck gate', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const config = JSON.parse(readFileSync('tsconfig.test.json', 'utf8')) as {
      compilerOptions?: {
        allowJs?: boolean;
        lib?: string[];
        noEmit?: boolean;
        types?: string[];
      };
      include?: string[];
      exclude?: string[];
    };

    expect(pkg.scripts?.['typecheck:test']).toBe('tsc --noEmit -p tsconfig.test.json');
    expect(pkg.scripts?.typecheck).toBe('tsc -b && npm run typecheck:test');
    expect(config.compilerOptions).toMatchObject({
      allowJs: true,
      noEmit: true,
    });
    expect(config.compilerOptions?.lib).toEqual(expect.arrayContaining([
      'ES2023', 'DOM', 'DOM.Iterable',
    ]));
    expect(config.compilerOptions?.types).toEqual(expect.arrayContaining([
      'node', 'vite/client',
    ]));
    expect(config.include).toEqual(expect.arrayContaining([
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'tests/e2e/**/*.ts',
      'scripts/check-world-cup-health.mjs',
    ]));
    expect(config.exclude).toEqual([]);
  });
});
