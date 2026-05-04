// ===== 花旗骰游戏 Hook =====

import { useState, useCallback, useRef, useEffect } from 'react';
import { usePersistedBalance } from '../../../hooks/usePersistedBalance';
import { CrapsPhase } from '../types';
import type { CrapsGameState, CrapsBetType } from '../types';
import { rollCrapsDice, getDiceSum, evaluateComeOutRoll, evaluatePointRoll } from '../logic/CrapsEngine';
import { CRAPS_ROLL_MS } from '../../../utils/motion';

const INITIAL_BALANCE = 10000;
const ROLL_DURATION_MS = CRAPS_ROLL_MS;

type HistoryType = 'natural' | 'craps' | 'point_set' | 'point_hit' | 'seven_out' | 'continue';

export const useCrapsGame = () => {
    const { balance, setBalance, resetBalance } = usePersistedBalance('craps', INITIAL_BALANCE);
    const [isRolling, setIsRolling] = useState(false);
    const [lastWin, setLastWin] = useState<number>(0);
    const [gameState, setGameState] = useState<CrapsGameState>({
        phase: CrapsPhase.Betting,
        roundStatus: 'come_out',
        bets: [],
        dice: null,
        point: null,
        history: [],
        message: '请下注，然后掷出开局骰',
    });
    const rollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearRollTimer = useCallback(() => {
        if (rollTimerRef.current) {
            clearTimeout(rollTimerRef.current);
            rollTimerRef.current = null;
        }
    }, []);

    const placeBet = (type: CrapsBetType, amount: number) => {
        if (gameState.phase !== CrapsPhase.Betting && gameState.phase !== CrapsPhase.PointSet) return;
        if (!Number.isFinite(amount) || amount <= 0 || amount > balance) return;
        if ((type === 'pass_line' || type === 'dont_pass') && gameState.roundStatus !== 'come_out') return;
        if ((type === 'come' || type === 'dont_come') && gameState.roundStatus !== 'point') return;

        setBalance(prev => prev - amount);
        setGameState(prev => ({ ...prev, bets: [...prev.bets, { type, amount }] }));
    };

    const clearBets = () => {
        if (gameState.phase !== CrapsPhase.Betting && gameState.phase !== CrapsPhase.PointSet) return;
        const total = gameState.bets.reduce((s, b) => s + b.amount, 0);
        setBalance(prev => prev + total);
        setGameState(prev => ({ ...prev, bets: [] }));
    };

    const roll = useCallback(() => {
        const canRoll = gameState.phase === CrapsPhase.Betting || gameState.phase === CrapsPhase.PointSet;
        if (!canRoll || gameState.bets.length === 0) return;

        const dice = rollCrapsDice();
        const sum = getDiceSum(dice);

        // 快照当前状态，避免闭包过期
        const currentBets = [...gameState.bets];
        const currentRoundStatus = gameState.roundStatus;
        const currentPoint = gameState.point;

        // 开始动画
        setIsRolling(true);
        setLastWin(0);
        setGameState(prev => ({
            ...prev,
            phase: currentRoundStatus === 'come_out' ? CrapsPhase.Rolling : CrapsPhase.PointRolling,
            dice,
            message: '掷骰中...',
        }));

        clearRollTimer();
        rollTimerRef.current = setTimeout(() => {
            rollTimerRef.current = null;
            setIsRolling(false);

            let totalPayout = 0;
            const resolvedBetIndices: number[] = [];

            if (currentRoundStatus === 'come_out') {
                const result = evaluateComeOutRoll(dice);

                // 结算单轮下注
                currentBets.forEach((bet, idx) => {
                    if (bet.type === 'field') {
                        resolvedBetIndices.push(idx);
                        if (sum === 2 || sum === 12) totalPayout += bet.amount * 3;
                        else if ([3, 4, 9, 10, 11].includes(sum)) totalPayout += bet.amount * 2;
                    } else if (bet.type === 'any_seven') {
                        resolvedBetIndices.push(idx);
                        if (sum === 7) totalPayout += bet.amount * 5;
                    } else if (bet.type === 'any_craps') {
                        resolvedBetIndices.push(idx);
                        if (sum === 2 || sum === 3 || sum === 12) totalPayout += bet.amount * 8;
                    }
                });

                if (result.type === 'natural') {
                    currentBets.forEach((bet, idx) => {
                        if (resolvedBetIndices.includes(idx)) return;
                        resolvedBetIndices.push(idx);
                        if (bet.type === 'pass_line') totalPayout += bet.amount * 2;
                    });
                    setLastWin(totalPayout);
                    setBalance(prev => prev + totalPayout);
                    setGameState(prev => ({
                        ...prev, phase: CrapsPhase.Result, dice, bets: [],
                        history: [{ dice, result: `自然胜 ${sum}!`, type: 'natural' as HistoryType, sum }, ...prev.history].slice(0, 20),
                        message: `🎉 开局自然胜 ${sum}! ${totalPayout > 0 ? `赢得 $${totalPayout}` : '过线注输'}`,
                    }));
                } else if (result.type === 'craps') {
                    currentBets.forEach((bet, idx) => {
                        if (resolvedBetIndices.includes(idx)) return;
                        resolvedBetIndices.push(idx);
                        if (bet.type === 'dont_pass') {
                            totalPayout += sum === 12 ? bet.amount : bet.amount * 2;
                        }
                    });
                    setLastWin(totalPayout);
                    setBalance(prev => prev + totalPayout);
                    setGameState(prev => ({
                        ...prev, phase: CrapsPhase.Result, dice, bets: [],
                        history: [{ dice, result: `花旗点 ${sum}!`, type: 'craps' as HistoryType, sum }, ...prev.history].slice(0, 20),
                        message: `💀 开局花旗 ${sum}! ${totalPayout > 0 ? `赢得 $${totalPayout}` : '过线注输'}`,
                    }));
                } else {
                    // Point set
                    setLastWin(totalPayout);
                    setBalance(prev => prev + totalPayout);
                    const remainBets = currentBets.filter((_, idx) => !resolvedBetIndices.includes(idx));
                    setGameState(prev => ({
                        ...prev, phase: CrapsPhase.PointSet, roundStatus: 'point',
                        dice, point: result.point, bets: remainBets,
                        history: [{ dice, result: `目标点: ${result.point}`, type: 'point_set' as HistoryType, sum }, ...prev.history].slice(0, 20),
                        message: `🎯 目标点设定为 ${result.point}！命中 ${result.point} 赢，摇到 7 输`,
                    }));
                }
            } else {
                // Point 阶段
                const pointResult = evaluatePointRoll(dice, currentPoint!);

                currentBets.forEach((bet, idx) => {
                    if (bet.type === 'field') {
                        resolvedBetIndices.push(idx);
                        if (sum === 2 || sum === 12) totalPayout += bet.amount * 3;
                        else if ([3, 4, 9, 10, 11].includes(sum)) totalPayout += bet.amount * 2;
                    } else if (bet.type === 'any_seven') {
                        resolvedBetIndices.push(idx);
                        if (sum === 7) totalPayout += bet.amount * 5;
                    } else if (bet.type === 'any_craps') {
                        resolvedBetIndices.push(idx);
                        if (sum === 2 || sum === 3 || sum === 12) totalPayout += bet.amount * 8;
                    }
                });

                if (pointResult.type === 'point_hit') {
                    currentBets.forEach((bet, idx) => {
                        if (resolvedBetIndices.includes(idx)) return;
                        resolvedBetIndices.push(idx);
                        if (bet.type === 'pass_line' || bet.type === 'come') totalPayout += bet.amount * 2;
                    });
                    setLastWin(totalPayout);
                    setBalance(prev => prev + totalPayout);
                    setGameState(prev => ({
                        ...prev, phase: CrapsPhase.Result, dice, bets: [],
                        roundStatus: 'come_out', point: null,
                        history: [{ dice, result: `目标点 ${currentPoint} 命中!`, type: 'point_hit' as HistoryType, sum }, ...prev.history].slice(0, 20),
                        message: `🎉 目标点 ${currentPoint} 命中！${totalPayout > 0 ? `赢得 $${totalPayout}` : ''}`,
                    }));
                } else if (pointResult.type === 'seven_out') {
                    currentBets.forEach((bet, idx) => {
                        if (resolvedBetIndices.includes(idx)) return;
                        resolvedBetIndices.push(idx);
                        if (bet.type === 'dont_pass' || bet.type === 'dont_come') totalPayout += bet.amount * 2;
                    });
                    setLastWin(totalPayout);
                    setBalance(prev => prev + totalPayout);
                    setGameState(prev => ({
                        ...prev, phase: CrapsPhase.Result, dice, bets: [],
                        roundStatus: 'come_out', point: null,
                        history: [{ dice, result: '七点出局!', type: 'seven_out' as HistoryType, sum }, ...prev.history].slice(0, 20),
                        message: `💀 七点出局！${totalPayout > 0 ? `赢得 $${totalPayout}` : '过线注输'}`,
                    }));
                } else {
                    // 继续
                    setLastWin(totalPayout);
                    setBalance(prev => prev + totalPayout);
                    const remainBets = currentBets.filter((_, idx) => !resolvedBetIndices.includes(idx));
                    setGameState(prev => ({
                        ...prev, phase: CrapsPhase.PointSet, dice, bets: remainBets,
                        history: [{ dice, result: `${sum}`, type: 'continue' as HistoryType, sum }, ...prev.history].slice(0, 20),
                        message: `${sum} — 继续掷骰，等待 ${currentPoint} 或 7${totalPayout > 0 ? ` (单轮赢 $${totalPayout})` : ''}`,
                    }));
                }
            }
        }, ROLL_DURATION_MS);
    }, [clearRollTimer, gameState.bets, gameState.phase, gameState.roundStatus, gameState.point, setBalance]);

    const resetGame = () => {
        clearRollTimer();
        setIsRolling(false);
        setLastWin(0);
        setGameState({
            phase: CrapsPhase.Betting, roundStatus: 'come_out', bets: [],
            dice: null, point: null, history: gameState.history,
            message: '请下注，然后掷出开局骰',
        });
    };

    const handleResetBalance = () => {
        clearRollTimer();
        resetBalance();
        setIsRolling(false);
        setLastWin(0);
        setGameState(prev => ({
            ...prev,
            phase: CrapsPhase.Betting,
            roundStatus: 'come_out',
            bets: [],
            dice: null,
            point: null,
            message: '请下注，然后掷出开局骰',
        }));
    };

    useEffect(() => clearRollTimer, [clearRollTimer]);

    return { gameState, balance, isRolling, lastWin, placeBet, clearBets, roll, resetGame, resetBalance: handleResetBalance };
};
