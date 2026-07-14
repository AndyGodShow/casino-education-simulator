// ===== 龙虎斗主入口 =====

import React, { useState } from 'react';
import { useDragonTigerGame } from './hooks/useDragonTigerGame';
import { getResultName } from './logic/DragonTigerEngine';
import { DTSimulation } from './components/DTSimulation';
import { DTRulesModal } from './components/DTRulesModal';
import { EducationalOverlay } from '../../components/Common/EducationalOverlay';
import { Card } from '../../components/Card/Card';
import { confirmResetBalance } from '../../utils/confirmResetBalance';
import '../../App.css';
import styles from './components/DragonTiger.module.css';

interface Props { onBackToLobby: () => void; }

const EDU_CONTENT = {
    title: "龙虎斗：最简赌场游戏的概率真相",
    sections: [
        {
            subtitle: "极简规则",
            content: "龙虎各发一张牌，比大小。K 最大，A 最小。和局时押龙/虎退回一半赌注。",
            highlights: [
                "龙和虎的胜率各约 46.26%，和局概率约 7.47%。",
                "押龙或虎的赌场优势约 3.73%（因和局退半注）。"
            ]
        },
        {
            subtitle: "和局陷阱",
            content: "和局赔率 8:1 看似诱人，但赌场优势高达 32.77%，是所有赌场游戏中最高的下注之一。",
            highlights: [
                "和局的真实概率仅 7.47%，但 8:1 的赔率暗示概率为 11.1%。",
                "长期押和是最快亏光的方式。"
            ]
        },
    ]
};

export const DragonTigerGame: React.FC<Props> = ({ onBackToLobby }) => {
    const [mode, setMode] = useState<'GAME' | 'SIMULATION'>('GAME');
    const { gameState, balance, placeBet, clearBets, deal, resetGame, resetBalance } = useDragonTigerGame();
    const [selectedChip, setSelectedChip] = useState(100);
    const [customChip, setCustomChip] = useState('');
    const [showEdu, setShowEdu] = useState(false);
    const [showRules, setShowRules] = useState(false);

    const totalBet = gameState.bets.reduce((s, b) => s + b.amount, 0);
    const isBetting = gameState.phase === 'BETTING';
    const isResult = gameState.phase === 'RESULT';
    const canResetBalance = isBetting || isResult;
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

    const renderCard = (card: import('../../logic/Card').Card | null, label: string, side: 'dragon' | 'tiger', idx: number) => (
        <div className={`${styles.cardSide} ${styles[side]}`}>
            <div className={styles.sideLabel}>{label}</div>
            <Card card={card ?? undefined} hidden={!card} dealIndex={idx} />
        </div>
    );

    return (
        <div className="game-container">
            <header className="game-header">
                <div className="header-left">
                    <button className="back-btn" onClick={onBackToLobby}>← 返回大厅</button>
                    <h1>龙虎斗 (Dragon Tiger)</h1>
                </div>
                <div className="header-controls">
                    <button className={`mode-btn ${mode === 'GAME' ? 'active' : ''}`} onClick={() => setMode('GAME')}>游戏模式</button>
                    <button className={`mode-btn ${mode === 'SIMULATION' ? 'active' : ''}`} onClick={() => setMode('SIMULATION')}>模拟测试</button>
                    <button className="edu-hub-btn" onClick={() => setShowEdu(true)}>🎓 概率分析</button>
                    <button className="help-btn" onClick={() => setShowRules(true)}>?</button>
                </div>
            </header>

            <DTRulesModal isOpen={showRules} onClose={() => setShowRules(false)} />
            <EducationalOverlay isOpen={showEdu} onClose={() => setShowEdu(false)} content={EDU_CONTENT} />

            <main className="game-area">
                {mode === 'GAME' ? (
                    <div className={styles.layout}>
                        {/* 牌面区 */}
                        <div className={styles.cardsArea}>
                            {renderCard(gameState.dragonCard, '龙 Dragon', 'dragon', 0)}
                            <div className={styles.vs}>
                                {isResult && gameState.result ? getResultName(gameState.result) : 'VS'}
                            </div>
                            {renderCard(gameState.tigerCard, '虎 Tiger', 'tiger', 1)}
                        </div>

                        {/* 信息 */}
                        {gameState.message && (
                            <div className={styles.messageBar}>{gameState.message}</div>
                        )}

                        {/* 下注区 */}
                        <div className={styles.betArea}>
                            {[
                                { type: 'dragon' as const, label: '龙', color: '#1565c0', odds: '1:1' },
                                { type: 'tie' as const, label: '和', color: '#2e7d32', odds: '8:1' },
                                { type: 'tiger' as const, label: '虎', color: '#c62828', odds: '1:1' },
                            ].map(b => (
                                <button
                                    key={b.type}
                                    className={styles.betBtn}
                                    style={{ background: `linear-gradient(135deg, ${b.color}, ${b.color}dd)` }}
                                    onClick={() => isBetting && placeBet(b.type, selectedChip)}
                                    disabled={!isBetting}
                                >
                                    <span className={styles.betLabel}>{b.label}</span>
                                    <span className={styles.betOdds}>{b.odds}</span>
                                    {getBetTotal(b.type) > 0 && <span className={styles.chipBadge}>${getBetTotal(b.type)}</span>}
                                </button>
                            ))}
                        </div>

                        {/* 控制区 */}
                        <div className={styles.controls}>
                            <div className={styles.statsRow}>
                                <span className={styles.stat}>余额: <strong>${balance.toLocaleString()}</strong>
                                    <button
                                        className={styles.resetBalBtn}
                                        onClick={handleResetBalance}
                                        title={canResetBalance ? '重置余额并清空当前局' : '请等待发牌完成'}
                                        aria-label="重置余额并清空当前局"
                                        disabled={!canResetBalance}
                                    >
                                        ↺
                                    </button>
                                </span>
                                <span className={styles.stat}>下注: <strong>${totalBet}</strong></span>
                                {gameState.history.length > 0 && (
                                    <div className={styles.history}>
                                        {gameState.history.slice(0, 12).map((r, i) => (
                                            <span key={i} className={`${styles.histDot} ${styles[`hist_${r}`]}`}>
                                                {getResultName(r)}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className={styles.chipRow}>
                                {CHIPS.map(c => (
                                    <button key={c} className={`${styles.chip} ${selectedChip === c ? styles.chipSel : ''}`}
                                        onClick={() => {
                                            setSelectedChip(c);
                                            setCustomChip('');
                                        }}>{c >= 1000 ? `${c / 1000}k` : c}</button>
                                ))}
                                <div className={styles.customChipInputWrapper}>
                                    <label className="visually-hidden" htmlFor="dragon-tiger-custom-bet">自定义下注金额</label>
                                    <span className={styles.currencySymbol}>$</span>
                                    <input
                                        id="dragon-tiger-custom-bet"
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
                                {isBetting && <>
                                    <button className={styles.dealBtn} onClick={deal} disabled={totalBet === 0}>🃏 发牌</button>
                                    <button className={styles.clearBtn} onClick={clearBets}>清除</button>
                                </>}
                                {isResult && <button className={styles.resetBtn} onClick={resetGame}>新一轮</button>}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="simulation-area"><DTSimulation /></div>
                )}
            </main>
        </div>
    );
};
