import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('dead-code inventory policy', () => {
  it('keeps all runtime surfaces in Knip and exposes stable quality scripts', () => {
    const config = JSON.parse(readFileSync('knip.json', 'utf8')) as {
      entry?: string[];
    };
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(config.entry).toEqual(expect.arrayContaining([
      'src/main.tsx',
      'api/**/*.ts',
      'tests/e2e/**/*.ts',
    ]));
    expect(pkg.devDependencies?.knip).toBeDefined();
    expect(pkg.scripts?.['check:dead-code']).toBe('knip');
    expect(pkg.scripts?.['report:dead-code']).toBe('knip --reporter json');
  });
});
