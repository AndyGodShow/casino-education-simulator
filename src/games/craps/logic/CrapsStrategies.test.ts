import { describe, expect, it } from 'vitest';
import { ALL_CRAPS_STRATEGIES } from './CrapsStrategies';

describe('craps strategy copy', () => {
    it('marks Come and Don’t Come batch simulations as simplified approximations', () => {
        const comeStrategy = ALL_CRAPS_STRATEGIES.find(strategy => strategy.name === '来注');
        const dontComeStrategy = ALL_CRAPS_STRATEGIES.find(strategy => strategy.name === '反来注');

        expect(comeStrategy?.description).toContain('近似');
        expect(comeStrategy?.description).toContain('不完全复刻');
        expect(dontComeStrategy?.description).toContain('近似');
        expect(dontComeStrategy?.description).toContain('不完全复刻');
    });
});
