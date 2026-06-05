import React, { useState } from 'react';
import { useSlotGame } from './hooks/useSlotGame';
import { SlotMachine } from './components/SlotMachine';
import { SlotControls } from './components/SlotControls';
import { SlotSimulation } from './components/SlotSimulation';
import { SlotRulesModal } from './components/SlotRulesModal';
import { EducationalOverlay } from '../../components/Common/EducationalOverlay';
import { SLOT_EDU_CONTENT } from './logic/SlotCopy';
import '../../App.css';

interface SlotGameProps {
    onBackToLobby: () => void;
}

export const SlotGame: React.FC<SlotGameProps> = ({ onBackToLobby }) => {
    const [mode, setMode] = useState<'GAME' | 'SIMULATION'>('GAME');

    const {
        gameState,
        balance,
        totalBet,
        spin,
        setBetPerLine,
        setActiveLines,
        resetGame,
        resetBalance,
        autoSpinCount,
        isAutoSpinning,
        startAutoSpin,
        stopAutoSpin,
    } = useSlotGame();

    const [showEducation, setShowEducation] = useState(false);
    const [showRules, setShowRules] = useState(false);

    const lastWin = gameState.lastResult?.totalWin ?? 0;

    return (
        <div className="game-container">
            <header className="game-header">
                <div className="header-left">
                    <button className="back-btn" onClick={onBackToLobby}>← 返回大厅</button>
                    <h1>老虎机 (Slot Machine)</h1>
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

            <SlotRulesModal isOpen={showRules} onClose={() => setShowRules(false)} />
            <EducationalOverlay
                isOpen={showEducation}
                onClose={() => setShowEducation(false)}
                content={SLOT_EDU_CONTENT}
            />

            <main className="game-area">
                {mode === 'GAME' ? (
                    <div className="slots-layout">
                        {/* Machine + Controls integrated in one visual unit */}
                        <SlotMachine
                            reels={gameState.reels}
                            phase={gameState.phase}
                            result={gameState.lastResult}
                            activeLines={gameState.activeLines}
                        >
                            <SlotControls
                                phase={gameState.phase}
                                balance={balance}
                                betPerLine={gameState.betPerLine}
                                activeLines={gameState.activeLines}
                                totalBet={totalBet}
                                lastWin={lastWin}
                                onSetBetPerLine={setBetPerLine}
                                onSetActiveLines={setActiveLines}
                                onSpin={spin}
                                onReset={resetGame}
                                onResetBalance={resetBalance}
                                autoSpinCount={autoSpinCount}
                                isAutoSpinning={isAutoSpinning}
                                onAutoSpin={startAutoSpin}
                                onStopAutoSpin={stopAutoSpin}
                            />
                        </SlotMachine>
                    </div>
                ) : (
                    <div className="simulation-area">
                        <SlotSimulation />
                    </div>
                )}
            </main>
        </div>
    );
};
