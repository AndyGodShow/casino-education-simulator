import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const deployScript = () => readFileSync(join(process.cwd(), 'scripts/deploy.sh'), 'utf8');

describe('deploy script safety policy', () => {
    it('does not stage every working tree change implicitly', () => {
        expect(deployScript()).not.toMatch(/git\s+add\s+\./);
    });

    it('does not push directly to main by default', () => {
        expect(deployScript()).not.toMatch(/git\s+push\s+origin\s+main/);
    });
});
