import React from 'react';
import type { RouletteGameState, RouletteBetType } from '../types';
import { getNumberInfo } from '../logic/RouletteEngine';
import styles from './RouletteTable.module.css';

interface RouletteTableProps {
    gameState: RouletteGameState;
    onPlaceBet: (type: RouletteBetType, amount: number, value?: number) => void;
    selectedChip: number;
}

export const RouletteTable: React.FC<RouletteTableProps> = ({ gameState, onPlaceBet, selectedChip }) => {
    const getBetAmount = (type: RouletteBetType, value?: number) => {
        return gameState.bets
            .filter(b => b.type === type && b.value === value)
            .reduce((sum, b) => sum + b.amount, 0);
    };

    const getAccessibleBetName = (label: string, amount: number) => (
        amount > 0 ? `${label}，当前下注 $${amount}` : label
    );

    const renderNumber = (num: number) => {
        const info = getNumberInfo(num);
        const amt = getBetAmount('straight', num);
        return (
            <button
                type="button"
                key={num}
                className={`${styles.cell} ${styles.number} ${styles[info.color]}`}
                onClick={() => onPlaceBet('straight', selectedChip, num)}
                aria-label={getAccessibleBetName(`直注 ${num}`, amt)}
            >
                {num}
                {amt > 0 && <span className={styles.chipCount}>${amt}</span>}
            </button>
        );
    };

    const renderOutside = (type: RouletteBetType, label: string, accessibleLabel: string) => {
        const amt = getBetAmount(type);
        return (
            <button
                type="button"
                className={`${styles.cell} ${styles.outside}`}
                onClick={() => onPlaceBet(type, selectedChip)}
                aria-label={getAccessibleBetName(accessibleLabel, amt)}
            >
                {label}
                {amt > 0 && <span className={styles.chipCount}>${amt}</span>}
            </button>
        );
    };

    const renderDozen = (type: RouletteBetType, label: string, accessibleLabel: string) => {
        const amt = getBetAmount(type);
        return (
            <button
                type="button"
                className={styles.dozen}
                onClick={() => onPlaceBet(type, selectedChip)}
                aria-label={getAccessibleBetName(accessibleLabel, amt)}
            >
                {label}
                {amt > 0 && <span className={styles.chipCount}>${amt}</span>}
            </button>
        );
    };

    // 街注起始号码：1, 4, 7, 10, ... 34
    const streetStarts = Array.from({ length: 12 }, (_, i) => i * 3 + 1);

    // 线注起始号码：1, 4, 7, ... 31（每两行一组）
    const lineStarts = Array.from({ length: 11 }, (_, i) => i * 3 + 1);

    return (
        <div className={styles.tableWrapper}>
            <div className={styles.bettingTable}>
                {/* Zero */}
                <button
                    type="button"
                    className={`${styles.cell} ${styles.zero}`}
                    onClick={() => onPlaceBet('straight', selectedChip, 0)}
                    aria-label={getAccessibleBetName('直注 0', getBetAmount('straight', 0))}
                >
                    0
                    {getBetAmount('straight', 0) > 0 && <span className={styles.chipCount}>${getBetAmount('straight', 0)}</span>}
                </button>

                {/* Numbers 1-36 Grid (3 rows, 12 columns) */}
                {[3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36].map(renderNumber)}
                {[2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35].map(renderNumber)}
                {[1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34].map(renderNumber)}

                {/* Columns */}
                {renderOutside('column3', '2 to 1', '第三列 3 到 36')}
                {renderOutside('column2', '2 to 1', '第二列 2 到 35')}
                {renderOutside('column1', '2 to 1', '第一列 1 到 34')}

                {/* Dozens */}
                {renderDozen('dozen1', '1st 12', '第一打 1 到 12')}
                {renderDozen('dozen2', '2nd 12', '第二打 13 到 24')}
                {renderDozen('dozen3', '3rd 12', '第三打 25 到 36')}

                {/* Outside Bets */}
                {renderOutside('low', '1 - 18', '小 1 到 18')}
                {renderOutside('even', 'EVEN', '偶数')}
                {renderOutside('red', 'RED', '红色')}
                {renderOutside('black', 'BLACK', '黑色')}
                {renderOutside('odd', 'ODD', '奇数')}
                {renderOutside('high', '19 - 36', '大 19 到 36')}
            </div>

            {/* 组合下注区域 */}
            <div className={styles.comboBets}>
                <h2 className={styles.comboTitle}>组合下注</h2>
                <div className={styles.comboGrid}>
                    {/* 街注 (Street Bets) */}
                    <div className={styles.comboSection}>
                        <span className={styles.comboLabel}>街注 (11:1)</span>
                        <div className={styles.comboButtons}>
                            {streetStarts.map(start => {
                                const amt = getBetAmount('street', start);
                                return (
                                    <button
                                        type="button"
                                        key={`street-${start}`}
                                        className={`${styles.comboBtn} ${amt > 0 ? styles.comboBtnActive : ''}`}
                                        onClick={() => onPlaceBet('street', selectedChip, start)}
                                        aria-label={getAccessibleBetName(`街注 ${start} 到 ${start + 2}`, amt)}
                                        title={getAccessibleBetName(`街注 ${start} 到 ${start + 2}`, amt)}
                                    >
                                        {start}-{start + 2}
                                        {amt > 0 && <span className={styles.comboBetAmt}>${amt}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 线注 (Line Bets) */}
                    <div className={styles.comboSection}>
                        <span className={styles.comboLabel}>线注 (5:1)</span>
                        <div className={styles.comboButtons}>
                            {lineStarts.map(start => {
                                const amt = getBetAmount('line', start);
                                return (
                                    <button
                                        type="button"
                                        key={`line-${start}`}
                                        className={`${styles.comboBtn} ${amt > 0 ? styles.comboBtnActive : ''}`}
                                        onClick={() => onPlaceBet('line', selectedChip, start)}
                                        aria-label={getAccessibleBetName(`线注 ${start} 到 ${start + 5}`, amt)}
                                        title={getAccessibleBetName(`线注 ${start} 到 ${start + 5}`, amt)}
                                    >
                                        {start}-{start + 5}
                                        {amt > 0 && <span className={styles.comboBetAmt}>${amt}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
