import { useCallback, useEffect, useState, lazy, Suspense, useTransition } from 'react';
import { Lobby } from './components/Lobby/Lobby';
import { ErrorBoundary } from './components/ErrorBoundary';
import { APP_PRELOAD_DELAY_MS } from './utils/motion';
import { useMediaQuery } from './hooks/useMediaQuery';

const loadBaccaratGame = () => import('./games/baccarat/BaccaratGame');
const loadBlackjackGame = () => import('./games/blackjack/BlackjackGame');
const loadRouletteGame = () => import('./games/roulette/RouletteGame');
const loadSlotGame = () => import('./games/slots/SlotGame');
const loadSicBoGame = () => import('./games/sicbo/SicBoGame');
const loadDragonTigerGame = () => import('./games/dragontiger/DragonTigerGame');
const loadSanGongGame = () => import('./games/sangong/SanGongGame');
const loadCrapsGame = () => import('./games/craps/CrapsGame');

// 懒加载：只有进入对应游戏时才加载其代码
const BaccaratGame = lazy(() => loadBaccaratGame().then(m => ({ default: m.BaccaratGame })));
const BlackjackGame = lazy(() => loadBlackjackGame().then(m => ({ default: m.BlackjackGame })));
const RouletteGame = lazy(() => loadRouletteGame().then(m => ({ default: m.RouletteGame })));
const SlotGame = lazy(() => loadSlotGame().then(m => ({ default: m.SlotGame })));
const SicBoGame = lazy(() => loadSicBoGame().then(m => ({ default: m.SicBoGame })));
const DragonTigerGame = lazy(() => loadDragonTigerGame().then(m => ({ default: m.DragonTigerGame })));
const SanGongGame = lazy(() => loadSanGongGame().then(m => ({ default: m.SanGongGame })));
const CrapsGame = lazy(() => loadCrapsGame().then(m => ({ default: m.CrapsGame })));

import './App.css';

type GameId = 'baccarat' | 'blackjack' | 'roulette' | 'slots' | 'sicbo' | 'dragontiger' | 'sangong' | 'craps';
type Screen = 'LOBBY' | 'BACCARAT' | 'BLACKJACK' | 'ROULETTE' | 'SLOTS' | 'SICBO' | 'DRAGONTIGER' | 'SANGONG' | 'CRAPS';

const GAME_ID_TO_SCREEN: Record<GameId, Screen> = {
  baccarat: 'BACCARAT',
  blackjack: 'BLACKJACK',
  roulette: 'ROULETTE',
  slots: 'SLOTS',
  sicbo: 'SICBO',
  dragontiger: 'DRAGONTIGER',
  sangong: 'SANGONG',
  craps: 'CRAPS',
};

const GAME_PRELOADERS: Record<GameId, () => Promise<unknown>> = {
  baccarat: loadBaccaratGame,
  blackjack: loadBlackjackGame,
  roulette: loadRouletteGame,
  slots: loadSlotGame,
  sicbo: loadSicBoGame,
  dragontiger: loadDragonTigerGame,
  sangong: loadSanGongGame,
  craps: loadCrapsGame,
};

const IDLE_PRELOAD_GAME_IDS: readonly GameId[] = ['baccarat', 'blackjack', 'roulette'];
const GAME_ROUTE_PREFIX = '#/games/';

const parseGameIdFromHash = (hash: string): GameId | null => {
  const normalizedHash = hash.trim().replace(/^#\/?/, '').replace(/\/+$/, '');

  if (!normalizedHash || normalizedHash === 'lobby') {
    return null;
  }

  const gameId = normalizedHash.startsWith('games/')
    ? normalizedHash.slice('games/'.length)
    : normalizedHash;

  return gameId in GAME_ID_TO_SCREEN
    ? gameId as GameId
    : null;
};

const getGameHash = (gameId: GameId) => `${GAME_ROUTE_PREFIX}${gameId}`;

const GameLoadingFallback = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '60vh',
    color: '#aaa',
    fontSize: '1.2rem',
    gap: '12px',
  }}>
    <span style={{ fontSize: '2rem', animation: 'pulse 1s infinite alternate' }}>🎲</span>
    加载中...
  </div>
);

function App() {
  const [screen, setScreen] = useState<Screen>(() => {
    if (typeof window === 'undefined') return 'LOBBY';

    const initialGameId = parseGameIdFromHash(window.location.hash);
    return initialGameId ? GAME_ID_TO_SCREEN[initialGameId] : 'LOBBY';
  });
  const [pendingGameId, setPendingGameId] = useState<GameId | null>(null);
  const [, startTransition] = useTransition();
  const isLobby = screen === 'LOBBY';
  const isTouchCompact = useMediaQuery('(pointer: coarse) and (max-height: 860px)');

  const preloadGame = useCallback((gameId: GameId) => {
    const preload = GAME_PRELOADERS[gameId];
    if (preload) {
      void preload();
    }
  }, []);

  const syncScreenFromHash = useCallback((hash: string) => {
    const nextGameId = parseGameIdFromHash(hash);

    if (nextGameId) {
      preloadGame(nextGameId);
    }

    setPendingGameId(null);
    startTransition(() => {
      setScreen(nextGameId ? GAME_ID_TO_SCREEN[nextGameId] : 'LOBBY');
    });
  }, [preloadGame, startTransition]);

  const navigateToHash = useCallback((nextHash: string) => {
    if (typeof window === 'undefined') return;

    if (window.location.hash === nextHash) {
      syncScreenFromHash(nextHash);
      return;
    }

    window.location.hash = nextHash;
  }, [syncScreenFromHash]);

  const handleSelectGame = (gameId: string) => {
    if (!(gameId in GAME_ID_TO_SCREEN)) return;

    const nextGameId = gameId as GameId;
    setPendingGameId(nextGameId);
    preloadGame(nextGameId);
    navigateToHash(getGameHash(nextGameId));
  };

  const handleBackToLobby = () => {
    setPendingGameId(null);
    navigateToHash('#/');
  };

  useEffect(() => {
    const preloadFeaturedGames = () => {
      IDLE_PRELOAD_GAME_IDS.forEach((gameId) => {
        preloadGame(gameId);
      });
    };

    if (typeof window === 'undefined') return undefined;

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (idleWindow.requestIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(() => preloadFeaturedGames());
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }

    const timer = window.setTimeout(preloadFeaturedGames, APP_PRELOAD_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [preloadGame]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleHashChange = () => {
      syncScreenFromHash(window.location.hash);
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [syncScreenFromHash]);

  return (
    <div className={`app-container ${isLobby ? 'is-lobby' : 'is-game'} ${isTouchCompact ? 'touch-compact' : ''}`}>
      {isLobby && (
        <Lobby
          onSelectGame={handleSelectGame}
          onPreviewGame={(gameId) => {
            if (gameId in GAME_ID_TO_SCREEN) {
              preloadGame(gameId as GameId);
            }
          }}
          pendingGameId={pendingGameId}
        />
      )}

      <ErrorBoundary fallbackMessage="游戏加载出错，请重试">
        <Suspense fallback={<GameLoadingFallback />}>
          {screen === 'BACCARAT' && <BaccaratGame onBackToLobby={handleBackToLobby} />}
          {screen === 'BLACKJACK' && <BlackjackGame onBackToLobby={handleBackToLobby} />}
          {screen === 'ROULETTE' && <RouletteGame onBackToLobby={handleBackToLobby} />}
          {screen === 'SLOTS' && <SlotGame onBackToLobby={handleBackToLobby} />}
          {screen === 'SICBO' && <SicBoGame onBackToLobby={handleBackToLobby} />}
          {screen === 'DRAGONTIGER' && <DragonTigerGame onBackToLobby={handleBackToLobby} />}
          {screen === 'SANGONG' && <SanGongGame onBackToLobby={handleBackToLobby} />}
          {screen === 'CRAPS' && <CrapsGame onBackToLobby={handleBackToLobby} />}
        </Suspense>
      </ErrorBoundary>

      {isLobby && (
        <footer className="app-footer">
          <p>教育用途模拟器 - 请勿用于真实赌博</p>
        </footer>
      )}
    </div>
  );
}

export default App;
