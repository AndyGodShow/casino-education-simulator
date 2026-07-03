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

    it('runs every release quality gate before committing and pushing', () => {
        const script = deployScript();
        const commitIndex = script.indexOf('git commit');

        expect(script).toContain('npm run lint');
        expect(script).toContain('npm run typecheck');
        expect(script).toContain('npm run test');
        expect(script).toContain('npm run build');
        expect(script).toContain('npm run test:e2e');
        expect(script).toContain('npm audit --audit-level=high');
        expect(commitIndex).toBeGreaterThan(script.indexOf('npm audit --audit-level=high'));
    });
});
