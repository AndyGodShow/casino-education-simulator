// ===== 花旗骰主入口（优化版）=====

import React, { useState } from 'react';
import { useCrapsGame } from './hooks/useCrapsGame';
import { CrapsDice } from './components/CrapsDice';
import { CrapsSimulationPanel } from './components/CrapsSimulation';
import { CrapsRulesModal } from './components/CrapsRulesModal';
import { EducationalOverlay } from '../../components/Common/EducationalOverlay';
import { confirmResetBalance } from '../../utils/confirmResetBalance';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import '../../App.css';
import styles from './components/Craps.module.css';

interface Props { onBackToLobby: () => void; }

const EDU_CONTENT = {
    title: "花旗骰：赌场优势最低的游戏之一",
    sections: [
        {
            subtitle: "两颗骰子的概率",
            content: "两颗骰子共有 36 种组合。总和 7 最常见（6种组合，16.67%），其次是 6 和 8（各 5 种，13.89%）。",
            highlights: [
                "7 的概率最高：6/36 = 16.67%。",
                "2 和 12 概率最低：各 1/36 = 2.78%。"
            ]
        },
        {
            subtitle: "过线注的数学优势",
            content: "过线注（Pass Line）的赌场优势仅 1.41%，是所有赌场游戏中最低的之一。反过线注（Don't Pass）更低，仅 1.36%。",
            highlights: [
                "开局掷骰有 8/36 的方式赢（7或11），4/36 输（2,3,12）。",
                "区域注看似覆盖多个数字，但赌场优势达 5.56%。",
                "任意七赔率 4:1 看似诱人，但赌场优势高达 16.67%。"
            ]
        },
    ]
};

const HIST_STYLE_MAP: Record<string, string> = {
    natural: 'histNatural',
    craps: 'histCraps',
    point_set: 'histPoint',
    point_hit: 'histPointHit',
    seven_out: 'histSevenOut',
    continue: 'histContinue',
};

export const CrapsGame: React.FC<Props> = ({ onBackToLobby }) => {
    const [mode, setMode] = useState<'GAME' | 'SIMULATION'>('GAME');
    const { gameState, balance, isRolling, lastWin, placeBet, clearBets, roll, resetGame, resetBalance } = useCrapsGame();
    const [selectedChip, setSelectedChip] = useState(100);
    const [customChip, setCustomChip] = useState('');
    const [showEdu, setShowEdu] = useState(false);
    const [showRules, setShowRules] = useState(false);
    const isCompactViewport = useMediaQuery('(max-width: 700px), ((pointer: coarse) and (max-height: 860px))');
    const [showPropBetsOnMobile, setShowPropBetsOnMobile] = useState(false);

    const totalBet = gameState.bets.reduce((s, b) => s + b.amount, 0);
    const canBet = gameState.phase === 'BETTING' || gameState.phase === 'POINT_SET';
    const canRoll = canBet && totalBet > 0;
    const isResult = gameState.phase === 'RESULT';
    const canResetBalance = canBet || isResult;
    const handleResetBalance = () => {
        if (!canResetBalance) return;
        if (!confirmResetBalance({ pendingStake: totalBet })) return;
        resetBalance();
    };
    const CHIPS = [10, 50, 100, 500, 1000];
    const getBetTotal = (type: string) => gameState.bets.filter(b => b.type === type).reduce((s, b) => s + b.amount, 0);
    const handleCustomChip = (value: string) => {
        setCustomChip(value);
        const parsed = Number.parseInt(value, 10);
        if (parsed > 0) setSelectedChip(parsed);
    };

    const isComeOut = gameState.roundStatus === 'come_out';
    const showPropBets = !isCompactViewport || showPropBetsOnMobile;

    // 消息类型
    const msgClass = gameState.message.includes('🎉') || gameState.message.includes('赢得')
        ? styles.messageWin
        : gameState.message.includes('💀') || gameState.message.includes('输')
            ? styles.messageLose
            : '';

    return (
        <div className="game-container">
            <header className="game-header">
                <div className="header-left">
                    <button className="back-btn" onClick={onBackToLobby}>← 返回大厅</button>
                    <h1>花旗骰 (Craps)</h1>
                </div>
                <div className="header-controls">
                    <button className={`mode-btn ${mode === 'GAME' ? 'active' : ''}`} onClick={() => setMode('GAME')}>游戏模式</button>
                    <button className={`mode-btn ${mode === 'SIMULATION' ? 'active' : ''}`} onClick={() => setMode('SIMULATION')}>模拟测试</button>
                    <button className="edu-hub-btn" onClick={() => setShowEdu(true)}>🎓 概率分析</button>
                    <button className="help-btn" onClick={() => setShowRules(true)}>?</button>
                </div>
            </header>

            <CrapsRulesModal isOpen={showRules} onClose={() => setShowRules(false)} />
            <EducationalOverlay isOpen={showEdu} onClose={() => setShowEdu(false)} content={EDU_CONTENT} />

            <main className="game-area">
                {mode === 'GAME' ? (
                    <div className={styles.layout}>
                        {/* ===== 骰子区 ===== */}
                        <div className={styles.diceArea}>
                            {/* ON/OFF Puck */}
                            <div className={styles.puckRow}>
                                <div className={`${styles.puck} ${gameState.point ? styles.puckOn : styles.puckOff}`}>
                                    {gameState.point ? 'ON' : 'OFF'}
                                </div>
                                {gameState.point && (
                                    <span className={styles.pointNumber}>目标点: {gameState.point}</span>
                                )}
                            </div>

                            {/* 骰子动画 */}
                            <CrapsDice dice={gameState.dice} isRolling={isRolling} />
                        </div>

                        {/* ===== 消息栏 ===== */}
                        {gameState.message && (
                            <div className={`${styles.messageBar} ${msgClass}`}>
                                {gameState.message}
                            </div>
                        )}

                        {/* ===== 牌桌区 ===== */}
                        <div className={styles.tableArea}>
                            {/* 主下注区：过线/反过线 或 来注/反来注 */}
                            <div className={styles.mainBetRow}>
                                {isComeOut ? (
                                    <>
                                        <button
                                            className={`${styles.betBtn} ${styles.passBtn}`}
                                            onClick={() => canBet && placeBet('pass_line', selectedChip)}
                                            disabled={!canBet}
                                        >
                                            <span className={styles.betLabel}>过线注</span>
                                            <span className={styles.betOdds}>1:1</span>
                                            <span className={styles.betDesc}>7/11赢 2/3/12输</span>
                                            {getBetTotal('pass_line') > 0 && <span className={styles.chipBadge}>${getBetTotal('pass_line')}</span>}
                                        </button>
                                        <button
                                            className={`${styles.betBtn} ${styles.dontPassBtn}`}
                                            onClick={() => canBet && placeBet('dont_pass', selectedChip)}
                                            disabled={!canBet}
                                        >
                                            <span className={styles.betLabel}>反过线注</span>
                                            <span className={styles.betOdds}>1:1</span>
                                            <span className={styles.betDesc}>2/3赢 7/11输 12平</span>
                                            {getBetTotal('dont_pass') > 0 && <span className={styles.chipBadge}>${getBetTotal('dont_pass')}</span>}
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            className={`${styles.betBtn} ${styles.comeBtn}`}
                                            onClick={() => canBet && placeBet('come', selectedChip)}
                                            disabled={!canBet}
                                        >
                                            <span className={styles.betLabel}>来注</span>
                                            <span className={styles.betOdds}>1:1</span>
                                            <span className={styles.betDesc}>同过线注</span>
                                            {getBetTotal('come') > 0 && <span className={styles.chipBadge}>${getBetTotal('come')}</span>}
                                        </button>
                                        <button
                                            className={`${styles.betBtn} ${styles.dontComeBtn}`}
                                            onClick={() => canBet && placeBet('dont_come', selectedChip)}
                                            disabled={!canBet}
                                        >
                                            <span className={styles.betLabel}>反来注</span>
                                            <span className={styles.betOdds}>1:1</span>
                                            <span className={styles.betDesc}>同反过线</span>
                                            {getBetTotal('dont_come') > 0 && <span className={styles.chipBadge}>${getBetTotal('dont_come')}</span>}
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* 区域注横跨全宽 */}
                            <button
                                className={`${styles.betBtn} ${styles.fieldBet}`}
                                onClick={() => canBet && placeBet('field', selectedChip)}
                                disabled={!canBet}
                            >
                                <span className={styles.betLabel}>区域注</span>
                                <div className={styles.fieldNumbers}>
                                    <span className={`${styles.fieldNum} ${styles.fieldNumBonus}`}>2 (2:1)</span>
                                    <span className={styles.fieldNum}>3</span>
                                    <span className={styles.fieldNum}>4</span>
                                    <span className={styles.fieldNum}>9</span>
                                    <span className={styles.fieldNum}>10</span>
                                    <span className={styles.fieldNum}>11</span>
                                    <span className={`${styles.fieldNum} ${styles.fieldNumBonus}`}>12 (2:1)</span>
                                </div>
                                {getBetTotal('field') > 0 && <span className={styles.chipBadge}>${getBetTotal('field')}</span>}
                            </button>

                                    {isCompactViewport && (
                                        <button
                                            type="button"
                                            className={styles.propToggleBtn}
                                            onClick={() => setShowPropBetsOnMobile((prev) => !prev)}
                                        >
                                            {showPropBets ? '收起边注' : '展开边注'}
                                        </button>
                                    )}

                            {showPropBets && (
                                <>
                                    <div className={styles.divider}>高赔率边注</div>

                                    <div className={styles.propBetsRow}>
                                        <button
                                            className={`${styles.betBtn} ${styles.anySevenBtn}`}
                                            onClick={() => canBet && placeBet('any_seven', selectedChip)}
                                            disabled={!canBet}
                                        >
                                            <span className={styles.betLabel}>任意七</span>
                                            <span className={styles.betOdds}>4:1</span>
                                            <span className={styles.betDesc}>仅总和7</span>
                                            {getBetTotal('any_seven') > 0 && <span className={styles.chipBadge}>${getBetTotal('any_seven')}</span>}
                                        </button>
                                        <button
                                            className={`${styles.betBtn} ${styles.anyCrapsBtn}`}
                                            onClick={() => canBet && placeBet('any_craps', selectedChip)}
                                            disabled={!canBet}
                                        >
                                            <span className={styles.betLabel}>任意花旗点</span>
                                            <span className={styles.betOdds}>7:1</span>
                                            <span className={styles.betDesc}>2, 3, 12</span>
                                            {getBetTotal('any_craps') > 0 && <span className={styles.chipBadge}>${getBetTotal('any_craps')}</span>}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* ===== 控制区 ===== */}
                        <div className={styles.controls}>
                            <div className={styles.statsRow}>
                                <span className={styles.stat}>余额: <strong>${balance.toLocaleString()}</strong>
                                    <button
                                        className={styles.resetBalBtn}
                                        onClick={handleResetBalance}
                                        title={canResetBalance ? '重置余额并清空当前局' : '请等待掷骰完成'}
                                        aria-label="重置余额并清空当前局"
                                        disabled={!canResetBalance}
                                    >
                                        ↺
                                    </button>
                                </span>
                                <span className={styles.stat}>下注: <strong>${totalBet}</strong></span>
                                {lastWin > 0 && isResult && (
                                    <span className={styles.stat} style={{ color: '#81c784' }}>+${lastWin}</span>
                                )}
                            </div>

                            {/* 历史记录 */}
                            {gameState.history.length > 0 && (
                                <div className={styles.history}>
                                    {gameState.history.slice(0, 10).map((h, i) => {
                                        const histStyle = h.type ? styles[HIST_STYLE_MAP[h.type] || 'histContinue'] : styles.histContinue;
                                        return (
                                            <span key={i} className={`${styles.histItem} ${histStyle}`} title={h.result}>
                                                {h.sum || (h.dice[0] + h.dice[1])}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}

                            <div className={styles.chipRow}>
                                {CHIPS.map(c => (
                                    <button key={c} className={`${styles.chip} ${selectedChip === c ? styles.chipSel : ''}`}
                                        onClick={() => {
                                            setSelectedChip(c);
                                            setCustomChip('');
                                        }}>{c >= 1000 ? `${c / 1000}k` : c}</button>
                                ))}
                                <div className={styles.customChipInputWrapper}>
                                    <label className="visually-hidden" htmlFor="craps-custom-bet">自定义下注金额</label>
                                    <span className={styles.currencySymbol}>$</span>
                                    <input
                                        id="craps-custom-bet"
                                        type="number"
                                        className={`${styles.chipInput} ${customChip ? styles.activeInput : ''}`}
                                        placeholder="自定义"
                                        value={customChip}
                                        onChange={(e) => handleCustomChip(e.target.value)}
                                        min={1}
                                    />
                                </div>
                            </div>
                            <div className={styles.btnRow}>
                                {canBet && <>
                                    <button className={styles.rollBtn} onClick={roll} disabled={!canRoll || isRolling}>
                                        {isRolling ? '🎲 掷骰中...' : '🎲 掷骰'}
                                    </button>
                                    <button className={styles.clearBtn} onClick={clearBets}>清除</button>
                                </>}
                                {isResult && <button className={styles.resetBtn} onClick={resetGame}>新一轮</button>}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="simulation-area"><CrapsSimulationPanel /></div>
                )}
            </main>
        </div>
    );
};
