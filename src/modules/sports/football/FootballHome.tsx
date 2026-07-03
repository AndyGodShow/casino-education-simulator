import { EducationNotice } from '../components/EducationNotice';
import { designCssVariables } from '../../ui/designSystem';
import styles from '../SportsLobby.module.css';

type FootballHomeProps = {
  onNavigate: (hash: string) => void;
  onBackToSports: () => void;
};

export function FootballHome({ onNavigate, onBackToSports }: FootballHomeProps) {
  return (
    <main className={styles.footballShell} style={designCssVariables}>
      <button type="button" className="back-btn" onClick={onBackToSports}>
        ← 返回体育大厅
      </button>
      <section className={styles.hero} aria-labelledby="football-title">
        <span className={styles.kicker}>足球</span>
        <h1 id="football-title">足球概率实验室</h1>
        <p>进入世界杯比赛中心，先看比赛结论，再看模型、市场和融合概率，最后展开解释和模拟影响。</p>
        <EducationNotice />
      </section>
      <section className={styles.cardGrid} aria-label="足球模块">
        <button type="button" className={`${styles.sportCard} ${styles.footballCard}`} onClick={() => onNavigate('#/sports/football/world-cup-2026')}>
          <span className={styles.statusAvailable}>可用 · 比赛中心</span>
          <h3>世界杯 2026</h3>
          <p>本地样例赛程 + 48 队小组结构，展示比赛列表、比赛详情、可信度分层和折叠式洞察。</p>
          <div className={styles.previewPanel}>
            <span>概率实验</span>
            <strong>比赛列表 → 比赛详情 → 折叠洞察</strong>
            <small>预期进球 · 胜平负 · 小组影响</small>
          </div>
          <span className={styles.enterHint}>点击进入</span>
        </button>
        <article className={styles.sportCard} aria-disabled="true">
          <span className={styles.statusSoon}>即将开放</span>
          <h3>俱乐部赛事</h3>
          <p>未来可扩展到联赛积分、杯赛淘汰和赛季长期概率模拟。</p>
        </article>
      </section>
    </main>
  );
}
