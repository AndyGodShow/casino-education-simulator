import { describe, expect, it } from 'vitest';
import { ALL_BLACKJACK_STRATEGIES } from './blackjack/logic/BlackjackStrategies';
import { ALL_CRAPS_STRATEGIES } from './craps/logic/CrapsStrategies';
import { ALL_DT_STRATEGIES } from './dragontiger/logic/DragonTigerStrategies';
import { ALL_ROULETTE_STRATEGIES } from './roulette/logic/RouletteStrategies';
import { ALL_SG_STRATEGIES } from './sangong/logic/SanGongStrategies';
import { ALL_STRATEGIES as ALL_SICBO_STRATEGIES } from './sicbo/logic/SicBoStrategies';
import { ALL_STRATEGIES as ALL_SLOT_STRATEGIES } from './slots/logic/SlotStrategies';

describe('simulation strategy catalogs', () => {
    it('offers a richer strategy catalog for every simulation panel', () => {
        expect(ALL_BLACKJACK_STRATEGIES).toHaveLength(7);
        expect(ALL_ROULETTE_STRATEGIES).toHaveLength(9);
        expect(ALL_CRAPS_STRATEGIES).toHaveLength(9);
        expect(ALL_DT_STRATEGIES).toHaveLength(7);
        expect(ALL_SG_STRATEGIES).toHaveLength(7);
        expect(ALL_SICBO_STRATEGIES).toHaveLength(9);
        expect(ALL_SLOT_STRATEGIES).toHaveLength(7);
    });

    it('includes named conservative, aggressive, progression, and high-risk examples', () => {
        expect(ALL_BLACKJACK_STRATEGIES.map(strategy => strategy.label)).toContain('反马丁格尔 + 基本策略');
        expect(ALL_ROULETTE_STRATEGIES.map(strategy => strategy.label)).toContain('达朗贝尔押红');
        expect(ALL_CRAPS_STRATEGIES.map(strategy => strategy.name)).toContain('保守组合');
        expect(ALL_DT_STRATEGIES.map(strategy => strategy.name)).toContain('龙 + 小和对冲');
        expect(ALL_SG_STRATEGIES.map(strategy => strategy.name)).toContain('庄闲 + 和局保险');
        expect(ALL_SICBO_STRATEGIES.map(strategy => strategy.name)).toContain('总和 10/11/12 组合');
        expect(ALL_SLOT_STRATEGIES.map(strategy => strategy.name)).toContain('止盈追击');
    });
});
