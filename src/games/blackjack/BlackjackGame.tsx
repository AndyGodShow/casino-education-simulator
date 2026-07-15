import React, { useState } from 'react';
import { useBlackjackGame } from './hooks/useBlackjackGame';
import { BlackjackTable } from './components/BlackjackTable';
import { BlackjackControls } from './components/BlackjackControls';
import { BlackjackSimulation } from './components/BlackjackSimulation';
import { BlackjackRulesModal } from './components/BlackjackRulesModal';
import { getBasicStrategyAction, calculateScore } from './logic/BlackjackRules';
import { EducationalOverlay } from '../../components/Common/EducationalOverlay';
import { GameStatusAnnouncer } from '../../components/Common/GameStatusAnnouncer';
import '../../App.css';

interface BlackjackGameProps {
    onBackToLobby: () => void;
}

const BLACKJACK_EDU_CONTENT = {
    title: "二十一点与'基本策略' (Basic Strategy)",
    sections: [
        {
            subtitle: "什么是基本策略？",
            content: "基本策略是通过计算机分析每一手牌的数学最优解。遵循基本策略可以将赌场优势降至约 0.5% 以下。",
            highlights: [
                "不要凭直觉补牌，数学胜率比运气更可靠。",
                "庄家明牌是决定你操作的关键因素。"
            ]
        },
        {
            subtitle: "核心原则",
            content: "当庄家明牌较弱（2-6）时，庄家更容易爆牌，你应该更保守。当庄家明牌较强（7-A）时，你需要努力补到 17 点以上。",
            highlights: [
                "硬 11 点通常总是加倍 (Double Down)。",
                "一对 8 或一对 Ace 通常总是分牌 (Split)。"
            ]
        }
    ]
};

export const BlackjackGame: React.FC<BlackjackGameProps> = ({ onBackToLobby }) => {
    const [mode, setMode] = useState<'GAME' | 'SIMULATION'>('GAME');
    const [showRules, setShowRules] = useState(false);

    const {
        gameState,
        balance,
        placeBet,
        deal,
        hit,
        stand,
        resetGame,
        resetBalance,
    } = useBlackjackGame();

    const [showEducation, setShowEducation] = useState(false);

    // Get strategy hint
    const currentHand = gameState.playerHands[0];
    const dealerUpcard = gameState.dealerHand.cards[0];
    let hint = '';
    if (gameState.phase === 'PLAYER_TURN' && dealerUpcard) {
        const { score, isSoft } = calculateScore(currentHand.cards);
        const action = getBasicStrategyAction(score, dealerUpcard, currentHand.cards.length, isSoft, currentHand.cards);
        const actionMap = {
            HIT: '要牌 (Hit)',
            STAND: '停牌 (Stand)',
            DOUBLE: '翻倍 (DoubleDown)',
            SPLIT: '分牌 (Split)'
        };
        hint = `数学建议: ${actionMap[action as keyof typeof actionMap]}`;
    }

    return (
        <div className="game-container">
            <GameStatusAnnouncer message={gameState.message} balance={balance} />
            <header className="game-header">
                <div className="header-left">
                    <button className="back-btn" onClick={onBackToLobby}>← 返回大厅</button>
                    <h1>二十一点 (Blackjack)</h1>
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
                        🎓 基本策略
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

            <BlackjackRulesModal isOpen={showRules} onClose={() => setShowRules(false)} />
            <EducationalOverlay
                isOpen={showEducation}
                onClose={() => setShowEducation(false)}
                content={BLACKJACK_EDU_CONTENT}
            />

            <main className="game-area">
                {mode === 'GAME' ? (
                    <div className="blackjack-layout">
                        <BlackjackTable gameState={gameState} />

                        {hint && (
                            <div className="strategy-hint-banner">
                                <span className="hint-icon">💡</span>
                                {hint}
                            </div>
                        )}

                        <div className="controls-area">
                            <BlackjackControls
                                phase={gameState.phase}
                                balance={balance}
                                currentBet={currentHand.bet}
                                onPlaceBet={placeBet}
                                onDeal={deal}
                                onHit={hit}
                                onStand={stand}
                                onReset={resetGame}
                                onResetBalance={resetBalance}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="simulation-area">
                        <BlackjackSimulation />
                    </div>
                )}
            </main>
        </div>
    );
};
