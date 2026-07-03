import { lazy, Suspense, useCallback, useEffect, useState, useTransition } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useMediaQuery } from './hooks/useMediaQuery';
import { MainLobby } from './modules/lobby/MainLobby';
import { APP_PRELOAD_DELAY_MS } from './utils/motion';
import './App.css';

const loadTraditionalLobby = () => import('./modules/traditional/TraditionalLobby');
const loadSportsLobby = () => import('./modules/sports/SportsLobby');
const loadFootballHome = () => import('./modules/sports/football/FootballHome');
const loadWorldCupHome = () => import('./modules/sports/football/worldCup/WorldCupHome');
const loadBaccaratGame = () => import('./modules/traditional/games/baccarat');
const loadBlackjackGame = () => import('./modules/traditional/games/blackjack');
const loadRouletteGame = () => import('./modules/traditional/games/roulette');
const loadSlotGame = () => import('./modules/traditional/games/slotMachine');
const loadSicBoGame = () => import('./modules/traditional/games/sicBo');
const loadDragonTigerGame = () => import('./modules/traditional/games/dragonTiger');
const loadSanGongGame = () => import('./modules/traditional/games/threeCard');
const loadCrapsGame = () => import('./modules/traditional/games/craps');

const TraditionalLobby = lazy(() => loadTraditionalLobby().then((m) => ({ default: m.TraditionalLobby })));
const SportsLobby = lazy(() => loadSportsLobby().then((m) => ({ default: m.SportsLobby })));
const FootballHome = lazy(() => loadFootballHome().then((m) => ({ default: m.FootballHome })));
const WorldCupHome = lazy(() => loadWorldCupHome().then((m) => ({ default: m.WorldCupHome })));
const BaccaratGame = lazy(() => loadBaccaratGame().then((m) => ({ default: m.BaccaratGame })));
const BlackjackGame = lazy(() => loadBlackjackGame().then((m) => ({ default: m.BlackjackGame })));
const RouletteGame = lazy(() => loadRouletteGame().then((m) => ({ default: m.RouletteGame })));
const SlotGame = lazy(() => loadSlotGame().then((m) => ({ default: m.SlotGame })));
const SicBoGame = lazy(() => loadSicBoGame().then((m) => ({ default: m.SicBoGame })));
const DragonTigerGame = lazy(() => loadDragonTigerGame().then((m) => ({ default: m.DragonTigerGame })));
const SanGongGame = lazy(() => loadSanGongGame().then((m) => ({ default: m.SanGongGame })));
const CrapsGame = lazy(() => loadCrapsGame().then((m) => ({ default: m.CrapsGame })));

type CanonicalGameId = 'baccarat' | 'blackjack' | 'roulette' | 'slot-machine' | 'sic-bo' | 'dragon-tiger' | 'three-card' | 'craps';
type Screen =
  | { type: 'main' }
  | { type: 'traditional' }
  | { type: 'sports' }
  | { type: 'football' }
  | { type: 'worldCup' }
  | { type: 'game'; gameId: CanonicalGameId };

const LEGACY_GAME_TO_CANONICAL: Record<string, CanonicalGameId> = {
  baccarat: 'baccarat',
  blackjack: 'blackjack',
  roulette: 'roulette',
  slots: 'slot-machine',
  'slot-machine': 'slot-machine',
  sicbo: 'sic-bo',
  'sic-bo': 'sic-bo',
  dragontiger: 'dragon-tiger',
  'dragon-tiger': 'dragon-tiger',
  sangong: 'three-card',
  'three-card': 'three-card',
  craps: 'craps',
};

const GAME_PRELOADERS: Record<CanonicalGameId, () => Promise<unknown>> = {
  baccarat: loadBaccaratGame,
  blackjack: loadBlackjackGame,
  roulette: loadRouletteGame,
  'slot-machine': loadSlotGame,
  'sic-bo': loadSicBoGame,
  'dragon-tiger': loadDragonTigerGame,
  'three-card': loadSanGongGame,
  craps: loadCrapsGame,
};

const IDLE_PRELOAD_GAME_IDS: readonly CanonicalGameId[] = ['baccarat', 'blackjack', 'roulette'];

const normalizeHashPath = (hash: string) => hash.trim().replace(/^#\/?/, '').replace(/\/+$/, '');

const parseScreenFromHash = (hash: string): Screen => {
  const path = normalizeHashPath(hash);
  if (!path || path === 'lobby') return { type: 'main' };
  if (path === 'traditional') return { type: 'traditional' };
  if (path === 'sports') return { type: 'sports' };
  if (path === 'sports/football') return { type: 'football' };
  if (path === 'sports/football/world-cup-2026') return { type: 'worldCup' };

  const legacyGame = path.startsWith('games/') ? path.slice('games/'.length) : null;
  const traditionalGame = path.startsWith('traditional/games/') ? path.slice('traditional/games/'.length) : null;
  const gameId = legacyGame ?? traditionalGame;
  if (gameId && gameId in LEGACY_GAME_TO_CANONICAL) {
    return { type: 'game', gameId: LEGACY_GAME_TO_CANONICAL[gameId] };
  }

  return { type: 'main' };
};

const getGameHash = (gameId: CanonicalGameId) => `#/traditional/games/${gameId}`;

const GameLoadingFallback = () => (
  <div className="app-loading" role="status">
    <span aria-hidden="true">●</span>
    加载中...
  </div>
);

function App() {
  const [screen, setScreen] = useState<Screen>(() => (typeof window === 'undefined' ? { type: 'main' } : parseScreenFromHash(window.location.hash)));
  const [pendingGameId, setPendingGameId] = useState<CanonicalGameId | null>(null);
  const [, startTransition] = useTransition();
  const isGame = screen.type === 'game';
  const isTouchCompact = useMediaQuery('(pointer: coarse) and (max-height: 860px)');

  const preloadGame = useCallback((gameId: CanonicalGameId) => {
    void GAME_PRELOADERS[gameId]?.();
  }, []);

  const navigateToHash = useCallback((nextHash: string) => {
    if (typeof window === 'undefined') return;
    if (window.location.hash === nextHash) {
      startTransition(() => setScreen(parseScreenFromHash(nextHash)));
      return;
    }
    window.location.hash = nextHash;
  }, [startTransition]);

  const handleSelectGame = useCallback((gameId: string) => {
    const nextGameId = LEGACY_GAME_TO_CANONICAL[gameId];
    if (!nextGameId) return;
    setPendingGameId(nextGameId);
    preloadGame(nextGameId);
    navigateToHash(getGameHash(nextGameId));
  }, [navigateToHash, preloadGame]);

  useEffect(() => {
    const preloadFeaturedGames = () => IDLE_PRELOAD_GAME_IDS.forEach(preloadGame);
    if (typeof window === 'undefined') return undefined;
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (idleWindow.requestIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(preloadFeaturedGames);
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }

    const timer = window.setTimeout(preloadFeaturedGames, APP_PRELOAD_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [preloadGame]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleHashChange = () => {
      const nextScreen = parseScreenFromHash(window.location.hash);
      if (nextScreen.type === 'game') preloadGame(nextScreen.gameId);
      setPendingGameId(null);
      startTransition(() => setScreen(nextScreen));
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [preloadGame, startTransition]);

  const backToTraditional = () => navigateToHash('#/traditional');

  return (
    <div className={`app-container ${isGame ? 'is-game' : 'is-lobby'} ${isTouchCompact ? 'touch-compact' : ''}`}>
      {screen.type === 'main' && <MainLobby onNavigate={navigateToHash} />}

      <ErrorBoundary fallbackMessage="模块加载出错，请重试">
        <Suspense fallback={<GameLoadingFallback />}>
          {screen.type === 'traditional' && (
            <TraditionalLobby
              onSelectGame={handleSelectGame}
              onPreviewGame={(gameId) => {
                const nextGameId = LEGACY_GAME_TO_CANONICAL[gameId];
                if (nextGameId) preloadGame(nextGameId);
              }}
              onBackToMain={() => navigateToHash('#/')}
              pendingGameId={pendingGameId}
            />
          )}
          {screen.type === 'sports' && <SportsLobby onNavigate={navigateToHash} onBackToMain={() => navigateToHash('#/')} />}
          {screen.type === 'football' && <FootballHome onNavigate={navigateToHash} onBackToSports={() => navigateToHash('#/sports')} />}
          {screen.type === 'worldCup' && <WorldCupHome onBackToFootball={() => navigateToHash('#/sports/football')} />}
          {screen.type === 'game' && screen.gameId === 'baccarat' && <BaccaratGame onBackToLobby={backToTraditional} />}
          {screen.type === 'game' && screen.gameId === 'blackjack' && <BlackjackGame onBackToLobby={backToTraditional} />}
          {screen.type === 'game' && screen.gameId === 'roulette' && <RouletteGame onBackToLobby={backToTraditional} />}
          {screen.type === 'game' && screen.gameId === 'slot-machine' && <SlotGame onBackToLobby={backToTraditional} />}
          {screen.type === 'game' && screen.gameId === 'sic-bo' && <SicBoGame onBackToLobby={backToTraditional} />}
          {screen.type === 'game' && screen.gameId === 'dragon-tiger' && <DragonTigerGame onBackToLobby={backToTraditional} />}
          {screen.type === 'game' && screen.gameId === 'three-card' && <SanGongGame onBackToLobby={backToTraditional} />}
          {screen.type === 'game' && screen.gameId === 'craps' && <CrapsGame onBackToLobby={backToTraditional} />}
        </Suspense>
      </ErrorBoundary>

      {!isGame && (
        <footer className="app-footer">
          <p>教育用途模拟器 - 请勿用于真实赌博、真实投注或真实交易</p>
        </footer>
      )}
    </div>
  );
}

export default App;
