import React from 'react';
import { RulesModal as RulesModalShell } from '../../../../components/RulesModal/RulesModal';
import styles from '../../../../components/RulesModal/RulesModal.module.css';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export const RulesModal: React.FC<Props> = ({ isOpen, onClose }) => (
    <RulesModalShell isOpen={isOpen} onClose={onClose} title="游戏指南 & 规则">
        <section>
            <h3>🎴 点数计算</h3>
            <p>百家乐中，牌的点数计算如下：</p>
            <ul>
                <li><strong>A:</strong> 1 点</li>
                <li><strong>2 - 9:</strong> 牌面点数</li>
                <li><strong>10, J, Q, K:</strong> 0 点</li>
            </ul>
            <p><strong>计算规则：</strong>将手中所有牌的点数相加，取个位数。例如：8 + 9 = 17，计为 <strong>7点</strong>。</p>
        </section>

        <section>
            <h3>🎮 游戏流程</h3>
            <ol>
                <li><strong>下注：</strong>玩家可选择押注 闲家(Player)、庄家(Banker)、和局(Tie)、闲对(Player Pair) 或 庄对(Banker Pair)。</li>
                <li><strong>发牌：</strong>系统分别为闲家和庄家各发两张牌。</li>
                <li><strong>天牌：</strong>若任一方前两张牌合计 8 或 9 点，称为"天牌" (Natural)，直接定胜负，不再补牌。</li>
                <li><strong>补牌：</strong>若无天牌，根据"补牌规则"决定是否发第三张牌。</li>
                <li><strong>比牌：</strong>最终点数接近 9 点的一方获胜。</li>
            </ol>
        </section>

        <section>
            <h3>📜 详细补牌规则</h3>
            <div className={styles.ruleGrid}>
                <div className={styles.ruleBox}>
                    <h4>闲家 (Player)</h4>
                    <ul>
                        <li><strong>0 - 5 点:</strong> 必须补第三张牌</li>
                        <li><strong>6 - 7 点:</strong> 停牌 (不补)</li>
                        <li><strong>8 - 9 点:</strong> 天牌 (直接决胜)</li>
                    </ul>
                </div>
                <div className={styles.ruleBox}>
                    <h4>庄家 (Banker)</h4>
                    <p>若闲家不补牌，庄家 0-5 补牌，6-7 停牌。</p>
                    <p>若闲家补了第三张牌，庄家规则如下：</p>
                    <ul>
                        <li><strong>0 - 2 点:</strong> 总是补牌</li>
                        <li><strong>3 点:</strong> 补牌 (除非闲家第三张是 8)</li>
                        <li><strong>4 点:</strong> 补牌 (限闲家第三张是 2-7)</li>
                        <li><strong>5 点:</strong> 补牌 (限闲家第三张是 4-7)</li>
                        <li><strong>6 点:</strong> 补牌 (限闲家第三张是 6-7)</li>
                        <li><strong>7 点:</strong> 总是停牌</li>
                    </ul>
                </div>
            </div>
        </section>

        <section>
            <h3>💰 赔率表</h3>
            <table className={styles.payoutTable}>
                <thead>
                    <tr>
                        <th>下注项</th>
                        <th>赔率</th>
                        <th>说明</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td className={styles.blue}>闲赢 (Player)</td>
                        <td>1 : 1</td>
                        <td>买 100 赢 100</td>
                    </tr>
                    <tr>
                        <td className={styles.red}>庄赢 (Banker)</td>
                        <td>1 : 0.95</td>
                        <td>买 100 赢 95 (扣5%佣金)</td>
                    </tr>
                    <tr>
                        <td className={styles.green}>和局 (Tie)</td>
                        <td>1 : 8</td>
                        <td>买 100 赢 800 (出现和局时，庄/闲注退回)</td>
                    </tr>
                    <tr>
                        <td>闲对 / 庄对</td>
                        <td>1 : 11</td>
                        <td>前两张牌牌面点数相同 (如 7♦️ 7♣️)</td>
                    </tr>
                </tbody>
            </table>
        </section>
    </RulesModalShell>
);
