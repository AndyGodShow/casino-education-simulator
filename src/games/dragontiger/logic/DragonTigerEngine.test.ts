import { describe, expect, it } from 'vitest';
import { Card, Rank, Suit } from '../../../logic/Card';
import { calculatePayout, determineResult, getCardValue, getResultName } from './DragonTigerEngine';

const card = (rank: Rank) => new Card(Suit.Spades, rank);

describe('DragonTigerEngine', () => {
    it('values ranks from ace low to king high', () => {
        expect(getCardValue(card(Rank.Ace))).toBe(1);
        expect(getCardValue(card(Rank.Ten))).toBe(10);
        expect(getCardValue(card(Rank.Jack))).toBe(11);
        expect(getCardValue(card(Rank.Queen))).toBe(12);
        expect(getCardValue(card(Rank.King))).toBe(13);
    });

    it('determines dragon, tiger, and tie outcomes', () => {
        expect(determineResult(card(Rank.King), card(Rank.Queen))).toBe('dragon');
        expect(determineResult(card(Rank.Two), card(Rank.Three))).toBe('tiger');
        expect(determineResult(card(Rank.Eight), new Card(Suit.Hearts, Rank.Eight))).toBe('tie');
    });

    it('settles dragon and tiger bets with half returned on tie', () => {
        expect(calculatePayout({ type: 'dragon', amount: 100 }, 'dragon')).toBe(200);
        expect(calculatePayout({ type: 'dragon', amount: 100 }, 'tiger')).toBe(0);
        expect(calculatePayout({ type: 'dragon', amount: 100 }, 'tie')).toBe(50);
        expect(calculatePayout({ type: 'tiger', amount: 100 }, 'tie')).toBe(50);
    });

    it('settles tie bets at eight to one plus stake', () => {
        expect(calculatePayout({ type: 'tie', amount: 100 }, 'tie')).toBe(900);
        expect(calculatePayout({ type: 'tie', amount: 100 }, 'dragon')).toBe(0);
    });

    it('provides localized result names', () => {
        expect(getResultName('dragon')).toBe('龙');
        expect(getResultName('tiger')).toBe('虎');
        expect(getResultName('tie')).toBe('和');
    });
});
