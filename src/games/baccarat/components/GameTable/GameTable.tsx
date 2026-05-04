import React from 'react';
import type { GameState } from '../../../../types';
import { Card } from '../../../../components/Card/Card';
import styles from './GameTable.module.css';
import { BeadPlate } from '../Roadmap/BeadPlate';

interface GameTableProps {
    gameState: GameState;
    deckRemaining: number;
}

export const GameTable: React.FC<GameTableProps> = ({ gameState, deckRemaining }) => {
    const hasHistory = gameState.history.length > 0;

    return (
        <div className={styles.table}>
            <div className={styles.deckInfo}>
                剩余牌数: {deckRemaining}
            </div>
            <div className={styles.header}>
                <div className={styles.statusMessage}>{gameState.message}</div>
            </div>

            <div className={styles.playArea}>
                {/* ... existing player/banker zones ... */}
                {/* Player Zone (Blue) */}
                <div className={`${styles.zone} ${styles.playerZone}`}>
                    <div className={styles.zoneHeader}>
                        <h2>闲家 (PLAYER)</h2>
                        <div className={styles.score}>{gameState.playerScore}</div>
                    </div>
                    <div className={styles.cardsContainer}>
                        {gameState.playerHand.map((card, idx) => (
                            <Card key={`p-${idx}`} card={card} dealIndex={idx * 2} dealLane="player" />
                        ))}
                        {gameState.playerHand.length === 0 && (
                            <div className={styles.placeholder}>等待发牌...</div>
                        )}
                    </div>
                </div>

                {/* Center Info / VS */}
                <div className={styles.centerInfo}>
                    <div className={styles.vsBadge}>VS</div>
                </div>

                {/* Banker Zone (Red) */}
                <div className={`${styles.zone} ${styles.bankerZone}`}>
                    <div className={styles.zoneHeader}>
                        <h2>庄家 (BANKER)</h2>
                        <div className={styles.score}>{gameState.bankerScore}</div>
                    </div>
                    <div className={styles.cardsContainer}>
                        {gameState.bankerHand.map((card, idx) => (
                            <Card key={`b-${idx}`} card={card} dealIndex={idx * 2 + 1} dealLane="banker" />
                        ))}
                        {gameState.bankerHand.length === 0 && (
                            <div className={styles.placeholder}>等待发牌...</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Roadmap Area */}
            {hasHistory ? (
                <div className={styles.roadmapArea}>
                    <BeadPlate history={gameState.history} />
                </div>
            ) : (
                <div className={styles.roadmapHint}>开局后这里会显示路单走势</div>
            )}
        </div>
    );
};
