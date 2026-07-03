import { CategoryCard } from './CategoryCard';
import { designCssVariables, designTokens } from '../ui/designSystem';
import styles from './MainLobby.module.css';

type MainLobbyProps = {
  onNavigate: (hash: string) => void;
};

export function MainLobby({ onNavigate }: MainLobbyProps) {
  const traditionalGames = ['百家乐', '二十一点', '轮盘', '老虎机', '骰宝', '龙虎斗', '三公', '花旗骰'];
  const sportsFeatures = ['足球世界杯 2026', '概率预测系统', '市场 vs 模型分析', '数据可信度系统'];

  return (
    <main className={styles.shell} style={designCssVariables}>
      <section className={styles.hero} aria-labelledby="main-lobby-title">
        <div className={styles.heroCopy}>
          <span className={styles.kicker}>概率教育模拟器</span>
          <h1 id="main-lobby-title">赌场教育模拟器</h1>
          <p>
            选择一个教育实验室。传统游戏保留原有入口，体育板块进入比赛中心，用模型概率、市场参考和可信度标签拆解比赛结论。
          </p>
        </div>
        <div className={styles.notice}>
          仅用于教育学习 · 所有资金、比赛和市场输出均为概率教育模拟，不构成投注、交易、投资或赌博建议。
        </div>
      </section>

      <section className={styles.categoryGrid} aria-label="平台板块">
        <CategoryCard
          title="传统游戏"
          eyebrow="8 个经典概率模块"
          description="经典赌场概率模型入口保持不变，只升级大厅视觉：百家乐、二十一点、轮盘、老虎机等模块继续按原路径打开。"
          focus="核心：返还率、庄家优势、长期期望、资金曲线"
          meta="8 个模块"
          accent={designTokens.colors.semantic.model}
          onSelect={() => onNavigate('#/traditional')}
        >
          <span className={styles.cardBadge}>逻辑保持不变</span>
          <div className={styles.gamePills} aria-label="传统游戏入口">
            {traditionalGames.map((game) => <span key={game}>{game}</span>)}
          </div>
          <span className={styles.enterHint}>点击进入</span>
        </CategoryCard>
        <CategoryCard
          title="体育预测实验室"
          eyebrow="比赛概率教育入口"
          description="从足球世界杯 2026 开始，把比赛结论、概率对比、市场差异和数据可信度放进同一个分析界面。"
          focus="核心：模型概率、市场参考、可信度分层"
          meta="世界杯 2026"
          accent={designTokens.colors.semantic.merged}
          onSelect={() => onNavigate('#/sports')}
        >
          <span className={styles.educationBadge}>仅用于教育学习</span>
          <div className={styles.featureList} aria-label="体育预测实验室能力">
            {sportsFeatures.map((feature) => <span key={feature}>{feature}</span>)}
          </div>
          <span className={styles.enterHint}>点击进入</span>
        </CategoryCard>
      </section>
    </main>
  );
}
