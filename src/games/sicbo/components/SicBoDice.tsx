// ===== 骰子动画组件 =====

import React from 'react';
import type { DiceResult } from '../types';
import { useRollingDiceFaces } from '../../../hooks/useRollingDiceFaces';
import { getDicePips } from '../../../utils/dicePips';
import { DICE_FACE_TICK_MS, getDiceMotionStyle } from '../../../utils/motion';
import styles from './SicBoDice.module.css';

interface SicBoDiceProps {
    dice: DiceResult | null;
    isRolling: boolean;
}

const DiceFace: React.FC<{ value: number; index: number; delay: number; isRolling: boolean }> = ({ value, index, delay, isRolling }) => {
    const pips = getDicePips(value);
    const motionStyle = {
        ...getDiceMotionStyle(index),
        '--die-delay': `${delay}ms`,
    } as React.CSSProperties;
    return (
        <div className={styles.dieStage} style={motionStyle}>
            <div className={`${styles.dieShadow} ${isRolling ? styles.shadowRolling : styles.shadowLanded}`} />
            <div className={`${styles.die} ${isRolling ? styles.rolling : styles.landed}`}>
                <div className={`${styles.dieFace} ${isRolling ? styles.dieFaceRolling : ''}`}>
                    {pips.map((pip, pipIndex) => (
                        <span
                            key={`${pip.row}-${pip.col}-${pipIndex}`}
                            className={styles.dot}
                            style={{
                                '--pip-row': pip.row,
                                '--pip-col': pip.col,
                                '--pip-delay': `${pipIndex * 18}ms`,
                            } as React.CSSProperties}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

export const SicBoDice: React.FC<SicBoDiceProps> = ({ dice, isRolling }) => {
    const finalDice = dice ?? [1, 1, 1] as DiceResult;
    const rollingDice = useRollingDiceFaces(finalDice, isRolling, DICE_FACE_TICK_MS) as DiceResult;

    if (!dice && !isRolling) return null;

    const displayDice = isRolling ? rollingDice : finalDice;
    const sum = dice ? dice[0] + dice[1] + dice[2] : 0;

    return (
        <div className={`${styles.diceContainer} ${isRolling ? styles.containerRolling : ''}`}>
            <div className={styles.diceRow}>
                {displayDice.map((value, i) => (
                    <DiceFace key={i} value={value} index={i} delay={i * 150} isRolling={isRolling} />
                ))}
            </div>
            {dice && !isRolling && (
                <div className={styles.sumDisplay}>
                    总和: <span className={styles.sumValue}>{sum}</span>
                </div>
            )}
        </div>
    );
};
