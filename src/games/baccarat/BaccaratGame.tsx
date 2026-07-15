import React, { useState } from 'react';
import { useBaccaratGame } from './hooks/useBaccaratGame';
import { GameTable } from './components/GameTable/GameTable';
import { Controls } from './components/Controls/Controls';
import { Simulation } from './components/Simulation/Simulation';
import { RulesModal } from './components/RulesModal/RulesModal';
import { EducationalOverlay } from '../../components/Common/EducationalOverlay';
import { GameStatusAnnouncer } from '../../components/Common/GameStatusAnnouncer';
import '../../App.css';

interface BaccaratGameProps {
    onBackToLobby: () => void;
}

const BACCARAT_EDU_CONTENT = {
    title: "百家乐数学原理与概率分析",
    sections: [
        {
            subtitle: "庄家与闲家的基本胜率",
            content: "在标准的8副牌百家乐中，扣除和局后，庄家的胜率约为 50.68%，闲家的胜率约为 49.32%。",
            highlights: [
                "庄家胜率略高是因为补牌规则对庄家更有利。",
                "这也是为什么庄家赢钱通常需要抽取 5% 的佣金。"
            ]
        },
        {
            subtitle: "赌场优势 (House Edge)",
            content: "赌场优势是玩家长期预期损失的百分比。",
            highlights: [
                "押庄 (Banker): 1.06% (最低，最理性选择)",
                "押闲 (Player): 1.24%",
                "押和 (Tie): 14.36% (极高，极力不建议长期投注)"
            ]
        },
        {
            subtitle: "关于'大路'与'路单'",
            content: "许多玩家通过观察过往结果（路单）来预测下一局。然而，从数学角度看，百家乐每一局都是独立事件（类似于抛硬币），过往的结果并不会改变下一局的物理概率。",
            highlights: [
                "路单是心理慰藉与记录工具，而非赢钱的保证。",
                "任何所谓的'必胜公式'在长期数学规律面前都是无效的。"
            ]
        }
    ]
};

export const BaccaratGame: React.FC<BaccaratGameProps> = ({ onBackToLobby }) => {
    const [mode, setMode] = useState<'GAME' | 'SIMULATION'>('GAME');
    const [showRules, setShowRules] = useState(false);
    const [showEducation, setShowEducation] = useState(false);

    const {
        gameState,
        playerState,
        placeBet,
        clearBet,
        startGame,
        resetForNewGame,
        resetBalance,
        deckRemaining
    } = useBaccaratGame();

    return (
        <div className="game-container">
            <GameStatusAnnouncer message={gameState.message} balance={playerState.balance} />
            <header className="game-header">
                <div className="header-left">
                    <button className="back-btn" onClick={onBackToLobby}>← 返回大厅</button>
                    <h1>百家乐 (Baccarat)</h1>
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
                        🎓 科普
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

            <RulesModal isOpen={showRules} onClose={() => setShowRules(false)} />
            <EducationalOverlay
                isOpen={showEducation}
                onClose={() => setShowEducation(false)}
                content={BACCARAT_EDU_CONTENT}
            />

            <main className="game-area">
                {mode === 'GAME' ? (
                    <>
                        <GameTable gameState={gameState} deckRemaining={deckRemaining} />

                        <div className="controls-area">
                            <Controls
                                gamePhase={gameState.phase}
                                playerState={playerState}
                                onPlaceBet={placeBet}
                                onClearBet={clearBet}
                                onDeal={startGame}
                                onReset={resetForNewGame}
                                onResetBalance={resetBalance}
                            />
                        </div>
                    </>
                ) : (
                    <div className="simulation-area">
                        <Simulation />
                    </div>
                )}
            </main>
        </div>
    );
};
