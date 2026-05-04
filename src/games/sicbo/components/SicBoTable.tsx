// ===== 骰宝下注桌面 =====

import React, { useState } from 'react';
import type { SicBoGameState, SicBoBetType } from '../types';
import { TOTAL_PAYOUTS } from '../types';
import styles from './SicBoTable.module.css';

interface SicBoTableProps {
    gameState: SicBoGameState;
    onPlaceBet: (type: SicBoBetType, amount: number, value?: number) => void;
    selectedChip: number;
}

const FEATURED_TOTALS = [8, 9, 10, 11, 12, 13];

const getBetTotal = (gameState: SicBoGameState, type: SicBoBetType, value?: number): number => {
    return gameState.bets
        .filter((bet) => bet.type === type && (value === undefined || bet.value === value))
        .reduce((sum, bet) => sum + bet.amount, 0);
};

export const SicBoTable: React.FC<SicBoTableProps> = ({ gameState, onPlaceBet, selectedChip }) => {
    const isBetting = gameState.phase === 'BETTING';
    const [activePanel, setActivePanel] = useState<'common' | 'total'>('common');

    const handleClick = (type: SicBoBetType, value?: number) => {
        if (!isBetting) return;
        onPlaceBet(type, selectedChip, value);
    };

    const renderChipBadge = (type: SicBoBetType, value?: number) => {
        const total = getBetTotal(gameState, type, value);
        if (total === 0) return null;
        return <span className={styles.chipBadge}>${total}</span>;
    };

    const commonSection = (
        <>
            <div className={styles.section}>
                <div className={styles.sectionTitle}>常用下注</div>
                <div className={styles.mainBets}>
                    <button
                        className={`${styles.betBtn} ${styles.smallBet}`}
                        onClick={() => handleClick('small')}
                        disabled={!isBetting}
                    >
                        <span className={styles.betLabel}>小</span>
                        <span className={styles.betDesc}>4-10</span>
                        <span className={styles.betOdds}>1:1</span>
                        {renderChipBadge('small')}
                    </button>
                    <button
                        className={`${styles.betBtn} ${styles.oddBet}`}
                        onClick={() => handleClick('odd')}
                        disabled={!isBetting}
                    >
                        <span className={styles.betLabel}>单</span>
                        <span className={styles.betDesc}>奇数</span>
                        <span className={styles.betOdds}>1:1</span>
                        {renderChipBadge('odd')}
                    </button>
                    <button
                        className={`${styles.betBtn} ${styles.evenBet}`}
                        onClick={() => handleClick('even')}
                        disabled={!isBetting}
                    >
                        <span className={styles.betLabel}>双</span>
                        <span className={styles.betDesc}>偶数</span>
                        <span className={styles.betOdds}>1:1</span>
                        {renderChipBadge('even')}
                    </button>
                    <button
                        className={`${styles.betBtn} ${styles.bigBet}`}
                        onClick={() => handleClick('big')}
                        disabled={!isBetting}
                    >
                        <span className={styles.betLabel}>大</span>
                        <span className={styles.betDesc}>11-17</span>
                        <span className={styles.betOdds}>1:1</span>
                        {renderChipBadge('big')}
                    </button>
                </div>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionTitle}>特殊下注</div>
                <div className={styles.tripleRow}>
                    <button
                        className={`${styles.betBtn} ${styles.anyTriple}`}
                        onClick={() => handleClick('any_triple')}
                        disabled={!isBetting}
                    >
                        <span className={styles.betLabel}>全围</span>
                        <span className={styles.betDesc}>任意三同号</span>
                        <span className={styles.betOdds}>30:1</span>
                        {renderChipBadge('any_triple')}
                    </button>
                </div>
            </div>
        </>
    );

    const totalSection = (
        <div className={styles.section}>
            <div className={styles.sectionTitle}>
                精选总和
                <span className={styles.oddsTag}>保留高频区间</span>
            </div>
            <div className={styles.totalGrid}>
                {FEATURED_TOTALS.map((num) => (
                    <button
                        key={num}
                        className={`${styles.totalBtn} ${gameState.dice && (gameState.dice[0] + gameState.dice[1] + gameState.dice[2]) === num
                            ? styles.winning
                            : ''}`}
                        onClick={() => handleClick('total', num)}
                        disabled={!isBetting}
                    >
                        <span className={styles.totalNum}>{num}</span>
                        <span className={styles.totalOdds}>{TOTAL_PAYOUTS[num]}:1</span>
                        {renderChipBadge('total', num)}
                    </button>
                ))}
            </div>
        </div>
    );

    return (
        <div className={styles.tableContainer}>
            <div className={styles.desktopOnly}>
                {commonSection}
                {totalSection}
            </div>

            <div className={styles.mobileOnly}>
                <div className={styles.mobileTabs}>
                    <button
                        className={`${styles.mobileTabBtn} ${activePanel === 'common' ? styles.mobileTabActive : ''}`}
                        onClick={() => setActivePanel('common')}
                        type="button"
                    >
                        常用盘
                    </button>
                    <button
                        className={`${styles.mobileTabBtn} ${activePanel === 'total' ? styles.mobileTabActive : ''}`}
                        onClick={() => setActivePanel('total')}
                        type="button"
                    >
                        总和
                    </button>
                </div>

                <div className={styles.mobilePanel}>
                    {activePanel === 'common' && commonSection}
                    {activePanel === 'total' && totalSection}
                </div>
            </div>
        </div>
    );
};
