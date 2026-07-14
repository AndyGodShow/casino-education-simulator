import React, { useState, useCallback } from 'react';
import { useRouletteGame } from './hooks/useRouletteGame';
import { RouletteWheel } from './components/RouletteWheel';
import { RouletteTable } from './components/RouletteTable';
import { RouletteControls } from './components/RouletteControls';
import { RouletteSimulation } from './components/RouletteSimulation';
import { RouletteRulesModal } from './components/RouletteRulesModal';
import { EducationalOverlay } from '../../components/Common/EducationalOverlay';
import { GameStatusAnnouncer } from '../../components/Common/GameStatusAnnouncer';
import '../../App.css';

interface RouletteGameProps {
    onBackToLobby: () => void;
}

const ROULETTE_EDU_CONTENT = {
    title: "轮盘赌：概率、赔率与'0'的作用",
    sections: [
        {
            subtitle: "轮盘的基本数学结构",
            content: "欧洲轮盘有 37 个数字（1-36 加一个绿色的 0）。所有的赔率都是基于 36 个数字计算的。",
            highlights: [
                "单号中奖赔率 35:1 (加上本金共 36 倍)。",
                "红/黑、单/双等中奖赔率 1:1。"
            ]
        },
        {
            subtitle: "为什么会有赌场优势？",
            content: "关键在于绿色的 '0'。当你押红或黑时，如果球落在 0，你依然会输。这意味着你的胜率不是 50%，而是 18/37 (48.6%)。",
            highlights: [
                "欧洲轮盘的赌场优势为 1/37 ≈ 2.7%。",
                "美国轮盘因为有两个零 (0 和 00)，优势高达 5.26%。"
            ]
        },
        {
            subtitle: "所谓的'必胜系统'",
            content: "马丁格尔（输了翻倍）等策略在轮盘上非常流行，但由于下注限额 and 赌场优势的存在，这些策略在长期内无法逆转数学期望值。",
            highlights: [
                "每一次旋转都是独立事件。",
                "没有任何下注组合能改变 2.7% 的固有劣势。"
            ]
        }
    ]
};

export const RouletteGame: React.FC<RouletteGameProps> = ({ onBackToLobby }) => {
    const [mode, setMode] = useState<'GAME' | 'SIMULATION'>('GAME');

    const {
        gameState,
        balance,
        spinResult,
        placeBet,
        clearBets,
        spin,
        resetGame,
        resetBalance,
    } = useRouletteGame();

    const [selectedChip, setSelectedChip] = useState(100);
    const [showEducation, setShowEducation] = useState(false);
    const [showRules, setShowRules] = useState(false);
    const [showWheel, setShowWheel] = useState(false);

    const totalBet = gameState.bets.reduce((sum, b) => sum + b.amount, 0);

    const handleSpin = useCallback(() => {
        setShowWheel(true);
        spin();
    }, [spin]);

    const handleWheelComplete = useCallback(() => {
        setShowWheel(false);
    }, []);

    return (
        <div className="game-container">
            <GameStatusAnnouncer message={gameState.message} balance={balance} />
            <header className="game-header">
                <div className="header-left">
                    <button className="back-btn" onClick={onBackToLobby}>← 返回大厅</button>
                    <h1>轮盘 (Roulette)</h1>
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

            <RouletteRulesModal isOpen={showRules} onClose={() => setShowRules(false)} />
            <EducationalOverlay
                isOpen={showEducation}
                onClose={() => setShowEducation(false)}
                content={ROULETTE_EDU_CONTENT}
            />

            {/* Wheel popup modal — appears on spin, auto-closes after result */}
            <RouletteWheel
                resultNumber={spinResult}
                isVisible={showWheel}
                onComplete={handleWheelComplete}
            />

            <main className="game-area">
                {mode === 'GAME' ? (
                    <div className="roulette-layout">
                        {/* Result message */}
                        {gameState.phase === 'RESULT' && gameState.lastNumber !== null && (
                            <div className="result-display">
                                {gameState.lastNumber}
                            </div>
                        )}

                        <RouletteTable
                            gameState={gameState}
                            onPlaceBet={placeBet}
                            selectedChip={selectedChip}
                        />

                        <div className="controls-area">
                            <RouletteControls
                                phase={gameState.phase}
                                balance={balance}
                                totalBet={totalBet}
                                history={gameState.history}
                                selectedChip={selectedChip}
                                onSelectChip={setSelectedChip}
                                onSpin={handleSpin}
                                onClear={clearBets}
                                onReset={resetGame}
                                onResetBalance={resetBalance}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="simulation-area">
                        <RouletteSimulation />
                    </div>
                )}
            </main>
        </div>
    );
};

