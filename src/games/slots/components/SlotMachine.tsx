import React, { useEffect, useRef, useState, useMemo } from 'react';
import type { SlotSymbol, SpinResult } from '../types';
import { SYMBOL_EMOJI, PAYLINE_PATTERNS, SlotPhase, SYMBOL_WEIGHTS } from '../types';
import type { SlotPhase as SlotPhaseType } from '../types';
import {
    SLOT_COUNT_UP_MS,
    SLOT_REEL_BASE_STOP_MS,
    SLOT_REEL_BOUNCE_MS,
    SLOT_REEL_STEP_STOP_MS,
    SLOT_REEL_TICK_MS,
} from '../../../utils/motion';
import { pickRandom } from '../../../logic/Random';
import styles from './SlotMachine.module.css';

interface SlotMachineProps {
    reels: SlotSymbol[][];
    phase: SlotPhaseType;
    result: SpinResult | null;
    activeLines: number;
    children?: React.ReactNode;
}

// 构建加权符号池用于动画
const WEIGHTED_POOL: SlotSymbol[] = [];
for (const [symbol, weight] of Object.entries(SYMBOL_WEIGHTS)) {
    for (let i = 0; i < weight; i++) {
        WEIGHTED_POOL.push(symbol as SlotSymbol);
    }
}
const randomSymbol = (): SlotSymbol => pickRandom(WEIGHTED_POOL);

// 装饰灯数量
const LIGHT_COUNT = 18;

// 赢额等级
const getWinTier = (totalWin: number, totalBet: number): 'none' | 'small' | 'medium' | 'big' => {
    if (totalWin <= 0) return 'none';
    const ratio = totalWin / totalBet;
    if (ratio >= 50) return 'big';
    if (ratio >= 10) return 'medium';
    return 'small';
};

// 赢额滚动递增 Hook
const useReducedMotion = () => {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        const query = window.matchMedia('(prefers-reduced-motion: reduce)');
        const update = () => setReduced(query.matches);
        update();
        query.addEventListener('change', update);
        return () => query.removeEventListener('change', update);
    }, []);
    return reduced;
};

const useCountUp = (target: number, reducedMotion: boolean, duration: number = SLOT_COUNT_UP_MS): number => {
    const [current, setCurrent] = useState(0);
    const animFrameRef = useRef<number>(0);

    useEffect(() => {
        if (reducedMotion) {
            const timer = setTimeout(() => setCurrent(target), 0);
            return () => clearTimeout(timer);
        }
        if (target <= 0) {
            setTimeout(() => setCurrent(0), 0);
            return;
        }
        const startTime = performance.now();
        const startVal = 0;
        const animate = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // easeOutExpo
            const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            setCurrent(Math.round(startVal + (target - startVal) * eased));
            if (progress < 1) {
                animFrameRef.current = requestAnimationFrame(animate);
            }
        };
        animFrameRef.current = requestAnimationFrame(animate);
        return () => {
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
            }
        };
    }, [target, reducedMotion, duration]);

    return current;
};

// 单个卷轴组件
const ReelColumn: React.FC<{
    colIdx: number;
    finalSymbols: SlotSymbol[];
    isSpinning: boolean;
    reducedMotion: boolean;
    winPositions: Set<string>;
}> = ({ colIdx, finalSymbols, isSpinning, reducedMotion, winPositions }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [spinSymbols, setSpinSymbols] = useState<SlotSymbol[]>([]);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [isStopping, setIsStopping] = useState(false);
    const [hasStopped, setHasStopped] = useState(true);

    useEffect(() => {
        if (reducedMotion) return undefined;
        if (isSpinning) {
            // 使用 setTimeout 避免在 effect 中同步 setState，满足严格的 lint 规则
            setTimeout(() => {
                setHasStopped(false);
                setIsStopping(false);
            }, 0);

            // 每 80ms 换一组随机符号
            intervalRef.current = setInterval(() => {
                setSpinSymbols([randomSymbol(), randomSymbol(), randomSymbol()]);
            }, SLOT_REEL_TICK_MS);

            // 停止时间根据列依次延迟
            const stopDelay = SLOT_REEL_BASE_STOP_MS + colIdx * SLOT_REEL_STEP_STOP_MS;
            const stopTimer = setTimeout(() => {
                if (intervalRef.current) clearInterval(intervalRef.current);
                setIsStopping(true);
                // 回弹效果时间
                setTimeout(() => {
                    setHasStopped(true);
                    setIsStopping(false);
                }, SLOT_REEL_BOUNCE_MS);
            }, stopDelay);

            return () => {
                if (intervalRef.current) clearInterval(intervalRef.current);
                clearTimeout(stopTimer);
            };
        } else {
            // 使用 setTimeout 避免在 effect 中同步 setState
            setTimeout(() => {
                if (intervalRef.current) clearInterval(intervalRef.current);
                setSpinSymbols([]);
                setHasStopped(true);
            }, 0);
        }
    }, [isSpinning, colIdx, reducedMotion]);

    const displaySymbols = !reducedMotion && isSpinning && !isStopping && !hasStopped
        ? (spinSymbols.length > 0 ? spinSymbols : finalSymbols)
        : finalSymbols;

    return (
        <div className={styles.reel} ref={containerRef}>
            <div className={`${styles.reelInner} ${!reducedMotion && isSpinning && !isStopping && !hasStopped ? styles.reelSpinning : ''} ${!reducedMotion && isStopping ? styles.reelStopping : ''}`}>
                {displaySymbols.map((symbol, rowIdx) => {
                    const posKey = `${colIdx}-${rowIdx}`;
                    const isWinning = winPositions.has(posKey) && hasStopped && !isSpinning;
                    return (
                        <div
                            key={rowIdx}
                            className={`${styles.symbolCell} ${isWinning ? styles.winning : ''}`}
                        >
                            <span className={styles.symbolEmoji}>
                                {SYMBOL_EMOJI[symbol]}
                            </span>
                            {/* 微光扫过效果 */}
                            {!isSpinning && hasStopped && <div className={styles.shimmer} />}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};


export const SlotMachine: React.FC<SlotMachineProps> = ({ reels, phase, result, activeLines, children }) => {
    const reducedMotion = useReducedMotion();
    const isSpinning = phase === SlotPhase.Spinning;
    const isResult = phase === SlotPhase.Result;

    const winningPositions = useMemo(() => {
        const positions = new Set<string>();
        if (result && result.paylines.length > 0) {
            result.paylines.forEach(pl => {
                const pattern = PAYLINE_PATTERNS[pl.lineIndex];
                for (let col = 0; col < pl.count; col++) {
                    positions.add(`${col}-${pattern[col]}`);
                }
            });
        }
        return positions;
    }, [result]);

    const totalBet = activeLines * 10; // 近似值仅用于显示等级
    const winTier = result ? getWinTier(result.totalWin, totalBet) : 'none';
    const displayWin = useCountUp(isResult && result ? result.totalWin : 0, reducedMotion);

    return (
        <div className={`${styles.machineFrame} ${winTier === 'big' ? styles.jackpotShake : ''}`}>
            {/* 顶部装饰灯条 */}
            <div className={styles.lightBar}>
                {Array.from({ length: LIGHT_COUNT }, (_, i) => (
                    <div
                        key={i}
                        className={`${styles.light} ${winTier !== 'none' ? styles.lightWin : ''}`}
                        style={{ animationDelay: `${i * 0.1}s` }}
                    />
                ))}
            </div>

            {/* 机器标题 */}
            <div className={styles.machineHeader}>
                <span className={styles.machineLogo}>
                    ★ FORTUNE REELS ★
                </span>
            </div>

            {/* 卷轴区域 */}
            <div className={styles.reelsContainer}>
                {/* 赔付线标记 - 左侧 */}
                <div className={styles.lineMarkers}>
                    {Array.from({ length: Math.min(activeLines, 10) }, (_, i) => (
                        <div
                            key={i}
                            className={`${styles.lineMarker} ${result?.paylines.some(p => p.lineIndex === i) ? styles.winningLine : ''}`}
                            title={`赔付线 ${i + 1}`}
                        >
                            {i + 1}
                        </div>
                    ))}
                </div>

                {/* 5 个卷轴 */}
                <div className={styles.reelsGrid}>
                    {/* 顶部遮罩 */}
                    <div className={styles.reelMaskTop} />
                    <div className={styles.reelColumns}>
                        {reels.map((reel, colIdx) => (
                            <ReelColumn
                                key={colIdx}
                                colIdx={colIdx}
                                finalSymbols={reel}
                                isSpinning={isSpinning}
                                reducedMotion={reducedMotion}
                                winPositions={winningPositions}
                            />
                        ))}
                    </div>
                    {/* 底部遮罩 */}
                    <div className={styles.reelMaskBottom} />
                </div>

                {/* 赔付线标记 - 右侧 */}
                <div className={styles.lineMarkers}>
                    {Array.from({ length: Math.min(activeLines, 10) }, (_, i) => {
                        const lineIdx = i + 10;
                        if (lineIdx >= activeLines) return null;
                        return (
                            <div
                                key={lineIdx}
                                className={`${styles.lineMarker} ${result?.paylines.some(p => p.lineIndex === lineIdx) ? styles.winningLine : ''}`}
                            >
                                {lineIdx + 1}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 中奖信息条 */}
            {isResult && result && result.totalWin > 0 && (
                <div className={`${styles.winBanner} ${styles[`win${winTier.charAt(0).toUpperCase() + winTier.slice(1)}`]}`}>
                    <div className={styles.winAmountWrapper}>
                        {winTier === 'big' && <span className={styles.jackpotLabel}>🏆 JACKPOT 🏆</span>}
                        <span className={styles.winAmount}>
                            {winTier === 'big' ? '💰' : '🎉'} ${displayWin.toLocaleString()} {winTier === 'big' ? '💰' : '🎉'}
                        </span>
                    </div>
                    <div className={styles.winDetails}>
                        {result.paylines.map((pl, idx) => (
                            <span key={idx} className={styles.winLine}>
                                线{pl.lineIndex + 1}: {SYMBOL_EMOJI[pl.symbol]}×{pl.count} = ${pl.payout}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* 大奖粒子特效 */}
            {winTier === 'big' && (
                <div className={styles.particleContainer}>
                    {Array.from({ length: 30 }, (_, i) => {
                        const style = {
                            left: `${(i * 3.3 + Math.sin(i) * 5) % 100}%`, // Deterministic random-like spread
                            animationDelay: `${(i * 0.1) % 2}s`,
                            animationDuration: `${1.5 + (i * 0.2) % 2}s`,
                        };
                        const emojis = ['💰', '🪙', '✨', '⭐', '💎'];
                        return (
                            <div
                                key={i}
                                className={styles.particle}
                                style={style}
                            >
                                {emojis[i % emojis.length]}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* 中奖闪烁覆盖层 */}
            {winTier === 'medium' && <div className={styles.mediumWinOverlay} />}

            {/* 控制面板（作为机器底部） */}
            {children}
        </div>
    );
};
