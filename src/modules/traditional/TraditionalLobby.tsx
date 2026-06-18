import { Lobby } from '../../components/Lobby/Lobby';
import styles from './TraditionalLobby.module.css';

type TraditionalLobbyProps = {
  onSelectGame: (gameId: string) => void;
  onPreviewGame?: (gameId: string) => void;
  onBackToMain: () => void;
  pendingGameId?: string | null;
};

export function TraditionalLobby(props: TraditionalLobbyProps) {
  return (
    <main className={styles.shell}>
      <div className={styles.topbar}>
        <button type="button" className="back-btn" onClick={props.onBackToMain}>
          ← 返回主入口
        </button>
        <p>Traditional Games 保留原有 8 款游戏、规则说明、批量模拟与虚拟余额体验。</p>
      </div>
      <Lobby
        onSelectGame={props.onSelectGame}
        onPreviewGame={props.onPreviewGame}
        pendingGameId={props.pendingGameId}
      />
    </main>
  );
}
