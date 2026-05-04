import { describe, expect, it } from 'vitest';
import {
    getDealMotionStyle,
    getDiceMotionStyle,
} from './motion';

describe('motion helpers', () => {
    it('creates staggered deal motion variables for alternating hands', () => {
        expect(getDealMotionStyle(0, 'player')).toEqual({
            '--deal-delay': '0ms',
            '--deal-x': '-28px',
            '--deal-rotate': '-7deg',
        });

        expect(getDealMotionStyle(3, 'banker')).toEqual({
            '--deal-delay': '270ms',
            '--deal-x': '28px',
            '--deal-rotate': '7deg',
        });
    });

    it('creates staggered dice motion variables with alternating travel direction', () => {
        expect(getDiceMotionStyle(0)).toEqual({
            '--die-delay': '0ms',
            '--die-travel-x': '-18px',
            '--die-travel-y': '-24px',
            '--die-rotate-x': '-34deg',
            '--die-rotate-y': '42deg',
            '--die-rotate-z': '-22deg',
        });

        expect(getDiceMotionStyle(2)).toEqual({
            '--die-delay': '180ms',
            '--die-travel-x': '-14px',
            '--die-travel-y': '-32px',
            '--die-rotate-x': '34deg',
            '--die-rotate-y': '42deg',
            '--die-rotate-z': '22deg',
        });
    });
});
