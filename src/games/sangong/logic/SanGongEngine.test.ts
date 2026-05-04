import { describe, expect, it } from 'vitest';
import { Card, Rank, Suit } from '../../../logic/Card';
import { calculatePayout, compareHands, evaluateHand, getResultName } from './SanGongEngine';

const card = (rank: Rank) => new Card(Suit.Hearts, rank);

describe('SanGongEngine', () => {
    it('evaluates three face cards as san gong', () => {
        const hand = evaluateHand([card(Rank.Jack), card(Rank.Queen), card(Rank.King)]);

        expect(hand.isSanGong).toBe(true);
        expect(hand.points).toBe(0);
        expect(hand.handName).toBe('三公');
    });

    it('evaluates non-face-card hands by points modulo ten', () => {
        const hand = evaluateHand([card(Rank.Four), card(Rank.Seven), card(Rank.Nine)]);

        expect(hand.isSanGong).toBe(false);
        expect(hand.points).toBe(0);
        expect(hand.handName).toBe('鳖十');
    });

    it('ranks san gong above point hands', () => {
        const sanGong = evaluateHand([card(Rank.Jack), card(Rank.Queen), card(Rank.King)]);
        const ninePoints = evaluateHand([card(Rank.Four), card(Rank.Five), card(Rank.Ten)]);

        expect(compareHands(sanGong, ninePoints)).toBe(1);
        expect(compareHands(ninePoints, sanGong)).toBe(-1);
    });

    it('compares point hands and treats equal points as tie', () => {
        const eightPoints = evaluateHand([card(Rank.Three), card(Rank.Five), card(Rank.Ten)]);
        const sevenPoints = evaluateHand([card(Rank.Two), card(Rank.Five), card(Rank.King)]);
        const anotherEightPoints = evaluateHand([card(Rank.Ace), card(Rank.Seven), card(Rank.Queen)]);

        expect(compareHands(eightPoints, sevenPoints)).toBe(1);
        expect(compareHands(sevenPoints, eightPoints)).toBe(-1);
        expect(compareHands(eightPoints, anotherEightPoints)).toBe(0);
    });

    it('settles player, banker, and tie bets with configured payouts', () => {
        expect(calculatePayout({ type: 'player_wins', amount: 100 }, 'player_wins')).toBe(200);
        expect(calculatePayout({ type: 'banker_wins', amount: 100 }, 'banker_wins')).toBe(195);
        expect(calculatePayout({ type: 'tie', amount: 100 }, 'tie')).toBe(900);
        expect(calculatePayout({ type: 'player_wins', amount: 100 }, 'banker_wins')).toBe(0);
    });

    it('provides localized result names', () => {
        expect(getResultName('player_wins')).toBe('闲赢');
        expect(getResultName('banker_wins')).toBe('庄赢');
        expect(getResultName('tie')).toBe('和局');
    });
});
