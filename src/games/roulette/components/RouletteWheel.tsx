import React, { useEffect, useState, useRef, useCallback } from 'react';
import styles from './RouletteWheel.module.css';
import {
    ROULETTE_CLOSE_MS,
    ROULETTE_RESULT_HOLD_MS,
    ROULETTE_SPIN_MS,
    ROULETTE_WHEEL_TRANSITION_MS,
} from '../../../utils/motion';
import { getSecureRandomInt } from '../../../logic/Random';

// European roulette wheel order (clockwise)
const WHEEL_NUMBERS = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
    5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

function getNumberColor(num: number): 'green' | 'red' | 'black' {
    if (num === 0) return 'green';
    return RED_NUMBERS.includes(num) ? 'red' : 'black';
}

const SECTOR_ANGLE = 360 / 37;

interface RouletteWheelProps {
    resultNumber: number | null;
    isVisible: boolean;
    onComplete: () => void;
}

export const RouletteWheel: React.FC<RouletteWheelProps> = ({
    resultNumber,
    isVisible,
    onComplete,
}) => {
    const [wheelRotation, setWheelRotation] = useState(0);
    const [ballRotation, setBallRotation] = useState(0);
    const [showBall, setShowBall] = useState(false);
    const [animPhase, setAnimPhase] = useState<'idle' | 'spinning' | 'result' | 'closing'>('idle');

    // Store all timer IDs so we can clean them all up
    const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    // Store onComplete in a ref to avoid dependency issues
    const onCompleteRef = useRef(onComplete);
    // Track if an animation is already running to prevent re-triggers
    const isAnimatingRef = useRef(false);
    // Store the current wheelRotation in a ref so we can read it without depending on it
    const wheelRotationRef = useRef(wheelRotation);

    // Sync refs in effect to avoid "refs during render" lint errors
    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);
    useEffect(() => {
        wheelRotationRef.current = wheelRotation;
    }, [wheelRotation]);

    const clearAllTimers = useCallback(() => {
        timersRef.current.forEach(t => clearTimeout(t));
        timersRef.current = [];
    }, []);

    useEffect(() => {
        if (isVisible && resultNumber !== null && !isAnimatingRef.current) {
            isAnimatingRef.current = true;
            clearAllTimers();

            const resultIndex = WHEEL_NUMBERS.indexOf(resultNumber);
            const targetSectorAngle = resultIndex * SECTOR_ANGLE + SECTOR_ANGLE / 2;

            const fullRotations = 6;
            const currentRotation = wheelRotationRef.current;
            const wheelTarget = currentRotation + fullRotations * 360 + getSecureRandomInt(3000) / 100;

            const ballFullRotations = 8;
            const finalBallAngle = -(targetSectorAngle + (wheelTarget % 360));
            const ballTarget = -(ballFullRotations * 360) + finalBallAngle;

            // Defer state updates to avoid synchronous setState in effect body
            const t0 = setTimeout(() => {
                setShowBall(true);
                setAnimPhase('spinning');
                setWheelRotation(wheelTarget);
                setBallRotation(ballTarget);
            }, 0);
            timersRef.current.push(t0);

            // After spin finishes, show result briefly, then close
            const t1 = setTimeout(() => {
                setAnimPhase('result');
                const t2 = setTimeout(() => {
                    setAnimPhase('closing');
                    const t3 = setTimeout(() => {
                        setAnimPhase('idle');
                        setShowBall(false);
                        isAnimatingRef.current = false;
                        onCompleteRef.current();
                    }, ROULETTE_CLOSE_MS);
                    timersRef.current.push(t3);
                }, ROULETTE_RESULT_HOLD_MS);
                timersRef.current.push(t2);
            }, ROULETTE_SPIN_MS);
            timersRef.current.push(t1);
        }

        return () => {
            // Only clear timers on unmount, not on re-render
        };
    }, [isVisible, resultNumber, clearAllTimers]);

    // Clean up all timers on unmount
    useEffect(() => {
        return () => {
            clearAllTimers();
        };
    }, [clearAllTimers]);

    // Reset when hidden
    useEffect(() => {
        if (!isVisible) {
            clearAllTimers();
            // Use a microtask to avoid state conflicts
            setTimeout(() => {
                setAnimPhase('idle');
                setShowBall(false);
                isAnimatingRef.current = false;
            }, 0);
        }
    }, [isVisible, clearAllTimers]);

    if (!isVisible && animPhase === 'idle') return null;

    const cx = 250, cy = 250, outerR = 230, innerR = 155, textR = 193;

    const sectors = WHEEL_NUMBERS.map((num, i) => {
        const startAngle = (i * SECTOR_ANGLE - 90) * (Math.PI / 180);
        const endAngle = ((i + 1) * SECTOR_ANGLE - 90) * (Math.PI / 180);

        const x1 = cx + outerR * Math.cos(startAngle);
        const y1 = cy + outerR * Math.sin(startAngle);
        const x2 = cx + outerR * Math.cos(endAngle);
        const y2 = cy + outerR * Math.sin(endAngle);
        const x3 = cx + innerR * Math.cos(endAngle);
        const y3 = cy + innerR * Math.sin(endAngle);
        const x4 = cx + innerR * Math.cos(startAngle);
        const y4 = cy + innerR * Math.sin(startAngle);

        const path = `M ${x1} ${y1} A ${outerR} ${outerR} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 0 0 ${x4} ${y4} Z`;

        // Angle in degrees for the midpoint of this sector (0° = top)
        const midDeg = (i + 0.5) * SECTOR_ANGLE;

        const color = getNumberColor(num);
        const fill = color === 'green' ? '#087f23' : color === 'red' ? '#b71c1c' : '#1a1a2e';

        return { num, path, midDeg, fill };
    });

    const studs = WHEEL_NUMBERS.map((_, i) => {
        const angle = (i * SECTOR_ANGLE - 90) * (Math.PI / 180);
        return {
            x: cx + (outerR + 5) * Math.cos(angle),
            y: cy + (outerR + 5) * Math.sin(angle),
        };
    });

    const isClosing = animPhase === 'closing';
    const colorClass = resultNumber !== null ? getNumberColor(resultNumber) : 'green';

    return (
        <div className={`${styles.overlay} ${isClosing ? styles.overlayExit : ''}`}>
            <div className={`${styles.modal} ${isClosing ? styles.modalExit : ''}`}>
                {/* Title */}
                <div className={styles.modalTitle}>
                    {animPhase === 'spinning' && '🎲 轮盘旋转中...'}
                    {animPhase === 'result' && resultNumber !== null && (
                        <>结果：<span className={styles[colorClass]}>{resultNumber}</span></>
                    )}
                    {animPhase === 'idle' && '准备旋转'}
                </div>

                {/* Wheel area */}
                <div className={styles.wheelContainer}>
                    <div className={styles.pointer}>▼</div>
                    <div className={styles.wheelFrame}>
                        <svg
                            viewBox="0 0 500 500"
                            className={styles.wheelSvg}
                            style={{
                                transform: `rotate(${wheelRotation}deg)`,
                                transition: animPhase === 'spinning'
                                    ? `transform ${ROULETTE_WHEEL_TRANSITION_MS}ms cubic-bezier(0.15, 0.6, 0.25, 1)`
                                    : 'none',
                            }}
                        >
                            <defs>
                                <radialGradient id="rimGrad" cx="50%" cy="50%" r="50%">
                                    <stop offset="75%" stopColor="#5d3a1a" />
                                    <stop offset="90%" stopColor="#8B5E3C" />
                                    <stop offset="100%" stopColor="#3e2410" />
                                </radialGradient>
                                <radialGradient id="centerGrad" cx="50%" cy="50%" r="50%">
                                    <stop offset="0%" stopColor="#2a2a3e" />
                                    <stop offset="70%" stopColor="#1a1a2e" />
                                    <stop offset="100%" stopColor="#0d0d1a" />
                                </radialGradient>
                                <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#ffd700" />
                                    <stop offset="50%" stopColor="#ffec80" />
                                    <stop offset="100%" stopColor="#daa520" />
                                </linearGradient>
                                <filter id="glow">
                                    <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                                    <feMerge>
                                        <feMergeNode in="coloredBlur" />
                                        <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                </filter>
                            </defs>

                            {/* Outer wooden rim */}
                            <circle cx={cx} cy={cy} r={outerR + 18} fill="url(#rimGrad)" />
                            <circle cx={cx} cy={cy} r={outerR + 18} fill="none" stroke="#2a1508" strokeWidth="2" />
                            <circle cx={cx} cy={cy} r={outerR + 3} fill="none" stroke="#daa520" strokeWidth="1.5" opacity="0.7" />

                            {/* Sectors */}
                            {sectors.map((s, i) => (
                                <g key={i}>
                                    <path d={s.path} fill={s.fill} stroke="#c9a034" strokeWidth="0.6" />
                                    {/* Number: rotate group to sector angle, place text at radius, centered */}
                                    <g transform={`rotate(${s.midDeg}, ${cx}, ${cy})`}>
                                        <text
                                            x={cx} y={cy - textR}
                                            fill="#fff"
                                            fontSize="12"
                                            fontWeight="700"
                                            fontFamily="'Helvetica Neue', Arial, sans-serif"
                                            textAnchor="middle"
                                            dy="0.38em"
                                            stroke="rgba(0,0,0,0.6)"
                                            strokeWidth="0.4"
                                            paintOrder="stroke"
                                            letterSpacing="0.5"
                                        >
                                            {s.num}
                                        </text>
                                    </g>
                                </g>
                            ))}

                            {/* Gold studs */}
                            {studs.map((s, i) => (
                                <circle key={i} cx={s.x} cy={s.y} r="2.5" fill="url(#goldGrad)" filter="url(#glow)" opacity="0.9" />
                            ))}

                            {/* Inner ring */}
                            <circle cx={cx} cy={cy} r={innerR} fill="url(#centerGrad)" />
                            <circle cx={cx} cy={cy} r={innerR} fill="none" stroke="#daa520" strokeWidth="1.5" opacity="0.5" />

                            {/* Frets */}
                            {WHEEL_NUMBERS.map((_, i) => {
                                const angle = (i * SECTOR_ANGLE - 90) * (Math.PI / 180);
                                return (
                                    <line
                                        key={i}
                                        x1={cx + innerR * Math.cos(angle)}
                                        y1={cy + innerR * Math.sin(angle)}
                                        x2={cx + (innerR - 12) * Math.cos(angle)}
                                        y2={cy + (innerR - 12) * Math.sin(angle)}
                                        stroke="#daa520" strokeWidth="0.6" opacity="0.3"
                                    />
                                );
                            })}

                            {/* Center hub */}
                            <circle cx={cx} cy={cy} r="55" fill="#1e1e30" stroke="#c9a034" strokeWidth="2.5" />
                            <circle cx={cx} cy={cy} r="38" fill="#14142a" stroke="#555" strokeWidth="0.5" />
                            {/* Decorative spokes */}
                            {[0, 60, 120, 180, 240, 300].map(deg => {
                                const rad = (deg - 90) * Math.PI / 180;
                                return (
                                    <line
                                        key={deg}
                                        x1={cx + 10 * Math.cos(rad)} y1={cy + 10 * Math.sin(rad)}
                                        x2={cx + 32 * Math.cos(rad)} y2={cy + 32 * Math.sin(rad)}
                                        stroke="#c9a034" strokeWidth="1.5" opacity="0.5" strokeLinecap="round"
                                    />
                                );
                            })}
                            <circle cx={cx} cy={cy} r="8" fill="#c9a034" opacity="0.7" />
                        </svg>

                        {/* Ball */}
                        {showBall && (
                            <div
                                className={styles.ballTrack}
                                style={{
                                    transform: `rotate(${ballRotation}deg)`,
                                    transition: animPhase === 'spinning'
                                        ? 'transform 4s cubic-bezier(0.12, 0.7, 0.2, 1)'
                                        : 'none',
                                }}
                            >
                                <div className={styles.ball} />
                            </div>
                        )}
                    </div>
                </div>

                {/* Result badge */}
                {animPhase === 'result' && resultNumber !== null && (
                    <div className={`${styles.resultBadge} ${styles[colorClass]}`}>
                        {resultNumber}
                    </div>
                )}
            </div>
        </div>
    );
};
