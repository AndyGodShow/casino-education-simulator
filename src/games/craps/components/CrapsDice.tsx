// ===== 花旗骰骰子动画组件 =====

import React from 'react';
import type { CrapsDice as CrapsDiceType } from '../types';
import { useRollingDiceFaces } from '../../../hooks/useRollingDiceFaces';
import { getDicePips } from '../../../utils/dicePips';
import { DICE_FACE_TICK_MS, getDiceMotionStyle } from '../../../utils/motion';
import styles from './CrapsDice.module.css';

interface CrapsDiceProps {
    dice: CrapsDiceType | null;
    isRolling: boolean;
}

const DiceFace: React.FC<{ value?: number; index: number; delay: number; isRolling: boolean; empty?: boolean }> = ({ value = 1, index, delay, isRolling, empty = false }) => {
    const pips = getDicePips(value);
    const motionStyle = {
        ...getDiceMotionStyle(index),
        '--die-delay': `${delay}ms`,
    } as React.CSSProperties;
    const dieClassName = [
        styles.die,
        empty ? styles.dieEmpty : '',
        !empty ? (isRolling ? styles.rolling : styles.landed) : '',
    ].filter(Boolean).join(' ');
    const shadowClassName = [
        styles.dieShadow,
        empty ? styles.shadowIdle : (isRolling ? styles.shadowRolling : styles.shadowLanded),
    ].join(' ');

    return (
        <div className={styles.dieStage} style={motionStyle}>
            <div className={shadowClassName} />
            <div className={dieClassName}>
                {empty ? (
                    <div className={styles.emptyMark}>?</div>
                ) : (
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
                )}
            </div>
        </div>
    );
};

export const CrapsDice: React.FC<CrapsDiceProps> = ({ dice, isRolling }) => {
    const finalDice = dice ?? [1, 1] as CrapsDiceType;
    const rollingDice = useRollingDiceFaces(finalDice, isRolling, DICE_FACE_TICK_MS) as CrapsDiceType;
    const displayDice = isRolling ? rollingDice : finalDice;
    const sum = dice ? dice[0] + dice[1] : 0;
    const hasDice = dice !== null;

    return (
        <div className={`${styles.diceContainer} ${isRolling ? styles.containerRolling : ''}`}>
            <div className={styles.diceRow}>
                {hasDice || isRolling ? (
                    <>
                        <DiceFace value={displayDice[0]} index={0} delay={0} isRolling={isRolling} />
                        <DiceFace value={displayDice[1]} index={1} delay={150} isRolling={isRolling} />
                        {!isRolling && hasDice && (
                            <div className={styles.sumBadge}>{sum}</div>
                        )}
                    </>
                ) : (
                    <>
                        <DiceFace index={0} delay={0} isRolling={false} empty />
                        <DiceFace index={1} delay={120} isRolling={false} empty />
                    </>
                )}
            </div>
        </div>
    );
};
