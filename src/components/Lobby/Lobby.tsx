import React from 'react';
import './Lobby.css';

interface GameInfo {
    id: string;
    name: string;
    description: string;
    focus: string;
    icon: string;
    status: 'active' | 'coming_soon';
    color: string;
}

interface LobbyProps {
    onSelectGame: (gameId: string) => void;
    onPreviewGame?: (gameId: string) => void;
    pendingGameId?: string | null;
}

const GAMES: GameInfo[] = [
    {
        id: 'baccarat',
        name: '百家乐',
        description: '经典的赌场游戏，模拟庄闲博弈与路单分析。',
        focus: '路单 / 第三张牌 / 长期期望',
        icon: '🎴',
        status: 'active',
        color: '#1a4e8a'
    },
    {
        id: 'blackjack',
        name: '二十一点',
        description: '策略性极强的扑克游戏，学习基本策略与算牌原理（开发中）。',
        focus: '基本策略 / 资金波动 / 庄家规则',
        icon: '🃏',
        status: 'active',
        color: '#2e7d32'
    },
    {
        id: 'roulette',
        name: '轮盘',
        description: '概率与运气的极致体现，探索多样化的下注组合。',
        focus: '欧洲轮盘 / 外围注 / 倍投陷阱',
        icon: '🎡',
        status: 'active',
        color: '#c62828'
    },
    {
        id: 'slots',
        name: '老虎机',
        description: '经典 5 卷轴老虎机，理解 RTP、符号权重与赌场优势。',
        focus: 'RTP / 符号权重 / 连线波动',
        icon: '🎰',
        status: 'active',
        color: '#b8860b'
    },
    {
        id: 'sicbo',
        name: '骰宝',
        description: '传统中式骰子游戏，探索三颗骰子的概率与赔率体系。',
        focus: '三骰分布 / 围骰 / 大小单双',
        icon: '🎲',
        status: 'active',
        color: '#8e24aa'
    },
    {
        id: 'dragontiger',
        name: '龙虎斗',
        description: '最简赌场游戏，龙虎各发一张牌比大小。',
        focus: '单牌比较 / 和局退半 / 胜率直觉',
        icon: '🐉',
        status: 'active',
        color: '#00695c'
    },
    {
        id: 'sangong',
        name: '三公',
        description: '传统中式纸牌游戏，三张牌比点数大小。',
        focus: '三张牌型 / 点数比较 / 庄闲波动',
        icon: '🃏',
        status: 'active',
        color: '#e65100'
    },
    {
        id: 'craps',
        name: '花旗骰',
        description: '西方经典骰子游戏，两阶段机制与最低赌场优势。',
        focus: 'Pass Line / Point / 骰面分布',
        icon: '🎲',
        status: 'active',
        color: '#1b5e20'
    }
];

export const Lobby: React.FC<LobbyProps> = ({ onSelectGame, onPreviewGame, pendingGameId = null }) => {
    const handlePreview = (gameId: string, status: GameInfo['status']) => {
        if (status !== 'active' || !onPreviewGame) return;
        onPreviewGame(gameId);
    };

    return (
        <div className="lobby-container">
            <section className="lobby-hero" aria-labelledby="lobby-title">
                <div className="lobby-hero-copy">
                    <span className="lobby-kicker">概率研究工作台</span>
                    <h1 id="lobby-title">赌场教育模拟器</h1>
                    <p>用可视化单局演示与批量模拟，观察赌场优势、资金曲线和策略失效的真实轨迹。</p>
                    <div className="lobby-metrics" aria-label="模拟器概览">
                        <span><strong>8</strong> 款游戏</span>
                        <span><strong>2</strong> 种模式</span>
                        <span><strong>0</strong> 真实下注</span>
                    </div>
                </div>
            </section>

            <section className="lobby-games" aria-label="选择游戏">
                <div className="lobby-section-heading">
                    <span>选择实验对象</span>
                    <p>每个游戏都包含单局体验、规则说明、概率分析和批量模拟。</p>
                </div>

                <div className="games-grid">
                    {GAMES.map((game) => {
                        const cardContent = (
                            <>
                                <div className="game-card-topline">
                                    <span className="game-icon" aria-hidden="true">{game.icon}</span>
                                    <span className="game-focus">{game.focus}</span>
                                </div>
                                <div className="game-info">
                                    <h3>{game.name}</h3>
                                    <p>{game.description}</p>
                                    {game.status === 'coming_soon' && (
                                        <span className="status-badge">即将推出</span>
                                    )}
                                </div>
                                {game.status === 'active' && (
                                    <span className="play-cta">{pendingGameId === game.id ? '正在进入...' : '开始学习'}</span>
                                )}
                            </>
                        );

                        if (game.status === 'active') {
                            return (
                                <button
                                    key={game.id}
                                    className={`game-card ${game.status}`}
                                    type="button"
                                    onClick={() => onSelectGame(game.id)}
                                    onMouseEnter={() => handlePreview(game.id, game.status)}
                                    onFocus={() => handlePreview(game.id, game.status)}
                                    onTouchStart={() => handlePreview(game.id, game.status)}
                                    aria-busy={pendingGameId === game.id}
                                    style={{ '--theme-color': game.color } as React.CSSProperties}
                                >
                                    {cardContent}
                                </button>
                            );
                        }

                        return (
                            <div
                                key={game.id}
                                className={`game-card ${game.status}`}
                                style={{ '--theme-color': game.color } as React.CSSProperties}
                            >
                                {cardContent}
                            </div>
                        );
                    })}
                </div>
            </section>

            <div className="lobby-footer">
                <p>本模拟器仅用于数学教育与概率研究，严禁用于任何形式的非法赌博。</p>
            </div>
        </div>
    );
};
