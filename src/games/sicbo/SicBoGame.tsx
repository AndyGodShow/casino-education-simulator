// ===== 骰宝主入口组件 =====

import React, { useState } from 'react';
import { useSicBoGame } from './hooks/useSicBoGame';
import { SicBoDice } from './components/SicBoDice';
import { SicBoTable } from './components/SicBoTable';
import { SicBoControls } from './components/SicBoControls';
import { SicBoSimulation } from './components/SicBoSimulation';
import { SicBoRulesModal } from './components/SicBoRulesModal';
import { EducationalOverlay } from '../../components/Common/EducationalOverlay';
import { GameStatusAnnouncer } from '../../components/Common/GameStatusAnnouncer';
import '../../App.css';

interface SicBoGameProps {
    onBackToLobby: () => void;
}

const SICBO_EDU_CONTENT = {
    title: "骰宝：三颗骰子背后的概率世界",
    sections: [
        {
            subtitle: "基本数学结构",
            content: "3 颗骰子共有 6×6×6 = 216 种等概率组合。总和范围为 3~18。",
            highlights: [
                "总和 10 和 11 出现频率最高（各 27/216 ≈ 12.5%）。",
                "总和 3 和 18 只有 1/216 的概率（约 0.46%）。"
            ]
        },
        {
            subtitle: "围骰与赌场优势",
            content: "围骰（三同号）共有 6 种可能，概率为 6/216 ≈ 2.78%。当围骰出现时，大/小和单/双的下注都会输，这就是赌场优势的核心来源。",
            highlights: [
                "大/小下注的胜率：105/216 ≈ 48.6%，赌场优势 2.78%。",
                "指定围骰的赌场优势高达 16.2%，远高于大/小。"
            ]
        },
        {
            subtitle: "理性下注建议",
            content: "大/小和单/双是赌场优势最低的下注（2.78%），适合长期游玩。高赔率的围骰和总和下注虽然诱人，但赌场优势远高于大/小。",
            highlights: [
                "没有任何策略能改变赌场的长期数学优势。",
                "短期运气只是概率波动，不代表策略有效。"
            ]
        }
    ]
};

export const SicBoGame: React.FC<SicBoGameProps> = ({ onBackToLobby }) => {
    const [mode, setMode] = useState<'GAME' | 'SIMULATION'>('GAME');

    const {
        gameState,
        balance,
        diceResult,
        placeBet,
        clearBets,
        roll,
        resetGame,
        resetBalance,
    } = useSicBoGame();

    const [selectedChip, setSelectedChip] = useState(100);
    const [showEducation, setShowEducation] = useState(false);
    const [showRules, setShowRules] = useState(false);

    const totalBet = gameState.bets.reduce((sum, b) => sum + b.amount, 0);

    return (
        <div className="game-container">
            <GameStatusAnnouncer message={gameState.message} balance={balance} />
            <header className="game-header">
                <div className="header-left">
                    <button className="back-btn" onClick={onBackToLobby}>← 返回大厅</button>
                    <h1>骰宝 (Sic Bo)</h1>
                </div>
                <div className="header-controls">
                    <button
                        className={`mode-btn ${mode === 'GAME' ? 'active' : ''}`}
                        onClick={() => setMode('GAME')}
                    >
                        游戏模式
                    </button>
                    <button
                        className={`mode-btn ${mode === 'SIMULATION' ? 'active' : ''}`}
                        onClick={() => setMode('SIMULATION')}
                    >
                        模拟测试
                    </button>
                    <button
                        className="edu-hub-btn"
                        onClick={() => setShowEducation(true)}
                        title="教育科普"
                    >
                        🎓 概率分析
                    </button>
                    <button
                        className="help-btn"
                        onClick={() => setShowRules(true)}
                        title="游戏说明"
                    >
                        ?
                    </button>
                </div>
            </header>

            <SicBoRulesModal isOpen={showRules} onClose={() => setShowRules(false)} />
            <EducationalOverlay
                isOpen={showEducation}
                onClose={() => setShowEducation(false)}
                content={SICBO_EDU_CONTENT}
            />

            <main className="game-area">
                {mode === 'GAME' ? (
                    <div className="roulette-layout">
                        {/* 骰子区域 */}
                        <SicBoDice
                            dice={diceResult}
                            isRolling={gameState.phase === 'ROLLING'}
                        />

                        {/* 结果信息 */}
                        {gameState.message && (
                            <div className="result-display" style={{ fontSize: '1rem', padding: '8px 16px' }}>
                                {gameState.message}
                            </div>
                        )}

                        {/* 下注桌面 */}
                        <SicBoTable
                            gameState={gameState}
                            onPlaceBet={placeBet}
                            selectedChip={selectedChip}
                        />

                        {/* 控制面板 */}
                        <div className="controls-area">
                            <SicBoControls
                                phase={gameState.phase}
                                balance={balance}
                                totalBet={totalBet}
                                history={gameState.history}
                                selectedChip={selectedChip}
                                onSelectChip={setSelectedChip}
                                onRoll={roll}
                                onClear={clearBets}
                                onReset={resetGame}
                                onResetBalance={resetBalance}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="simulation-area">
                        <SicBoSimulation />
                    </div>
                )}
            </main>
        </div>
    );
};
