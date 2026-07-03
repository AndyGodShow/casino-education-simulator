import { ComingSoonCard } from './components/ComingSoonCard';
import { EducationNotice } from './components/EducationNotice';
import { designCssVariables } from '../ui/designSystem';
import styles from './SportsLobby.module.css';

type SportsLobbyProps = {
  onNavigate: (hash: string) => void;
  onBackToMain: () => void;
};

export function SportsLobby({ onNavigate, onBackToMain }: SportsLobbyProps) {
  return (
    <main className={styles.shell} style={designCssVariables}>
      <button type="button" className="back-btn" onClick={onBackToMain}>
        ← 返回主入口
      </button>
      <section className={styles.hero} aria-labelledby="sports-title">
        <span className={styles.kicker}>体育预测实验室</span>
        <h1 id="sports-title">体育预测实验室</h1>
        <p>选择运动项目进入概率教育界面。当前只开放足球，篮球和电竞为即将开放状态，不会跳转到空页面。</p>
        <EducationNotice />
      </section>

      <section className={styles.cardGrid} aria-label="体育项目">
        <button type="button" className={`${styles.sportCard} ${styles.footballCard}`} onClick={() => onNavigate('#/sports/football')}>
          <span className={styles.statusAvailable}>可用 · 概率实验</span>
          <h3>足球</h3>
          <p>进入世界杯 2026，查看比赛概率分析、模型 vs 市场对比，以及数据可信度提示。</p>
          <div className={styles.previewPanel} aria-label="世界杯 2026 预览">
            <span>世界杯 2026</span>
            <strong>比赛概率分析</strong>
            <small>模型 vs 市场 · 可信度系统 · 小组影响</small>
          </div>
          <span className={styles.enterHint}>点击进入</span>
        </button>
        <ComingSoonCard title="篮球" description="即将开放 · 未来支持篮球赛事和联赛概率教育模拟。" />
        <ComingSoonCard title="电竞" description="即将开放 · 未来支持电竞赛制下的比赛概率教育模拟。" />
      </section>
    </main>
  );
}
