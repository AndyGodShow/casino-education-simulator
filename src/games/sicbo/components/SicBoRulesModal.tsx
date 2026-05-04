// ===== 骰宝规则说明弹窗 =====

import React from 'react';

interface SicBoRulesModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SicBoRulesModal: React.FC<SicBoRulesModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(0,0,0,0.8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 20,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
                    borderRadius: 20,
                    padding: '30px 35px',
                    maxWidth: 700,
                    maxHeight: '80vh',
                    overflowY: 'auto',
                    border: '1px solid rgba(142, 36, 170, 0.3)',
                    color: '#ddd',
                    lineHeight: 1.7,
                }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h2 style={{ color: '#fff', margin: 0 }}>🎲 骰宝规则</h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent', border: 'none',
                            color: '#aaa', fontSize: '1.5rem', cursor: 'pointer',
                        }}
                    >×</button>
                </div>

                <h3 style={{ color: '#ce93d8' }}>游戏简介</h3>
                <p>
                    骰宝（Sic Bo）是起源于中国的传统赌博游戏，在澳门和亚洲赌场非常流行。
                    游戏使用 <strong>3 颗骰子</strong>，玩家在掷骰前选择下注区域，
                    庄家掷骰后根据结果派彩。
                </p>

                <h3 style={{ color: '#ce93d8' }}>下注类型</h3>
                <p style={{ color: '#aaa', marginTop: 0 }}>
                    当前界面已精简为常用下注，先保留最容易理解、最常玩的盘口。
                </p>

                <table style={{
                    width: '100%', borderCollapse: 'collapse', marginBottom: 15,
                    fontSize: '0.9rem',
                }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                            <th style={{ textAlign: 'left', padding: 8, color: '#aaa' }}>类型</th>
                            <th style={{ textAlign: 'left', padding: 8, color: '#aaa' }}>描述</th>
                            <th style={{ textAlign: 'center', padding: 8, color: '#ffd700' }}>赔率</th>
                            <th style={{ textAlign: 'center', padding: 8, color: '#aaa' }}>赌场优势</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[
                            ['大/小', '总和 11-17 或 4-10（围骰除外）', '1:1', '2.78%'],
                            ['单/双', '总和奇数或偶数（围骰除外）', '1:1', '2.78%'],
                            ['精选总和', '保留 8-13 这些高频总和', '6:1 ~ 8:1', '不等'],
                            ['全围', '任意三同号', '30:1', '13.89%'],
                        ].map(([type, desc, odds, edge], i) => (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: 8, fontWeight: 'bold' }}>{type}</td>
                                <td style={{ padding: 8, color: '#aaa' }}>{desc}</td>
                                <td style={{ padding: 8, textAlign: 'center', color: '#ffd700' }}>{odds}</td>
                                <td style={{ padding: 8, textAlign: 'center' }}>{edge}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <h3 style={{ color: '#ce93d8' }}>关键概念</h3>
                <ul style={{ paddingLeft: 20 }}>
                    <li><strong>围骰规则：</strong>当三颗骰子相同时，「大/小」和「单/双」的下注都输。这就是赌场的优势来源。</li>
                    <li><strong>赌场优势：</strong>大/小下注的赌场优势为 2.78%，是骰宝中最有利的下注。</li>
                    <li><strong>精简思路：</strong>像指定围骰、双骰、两骰组合这类高复杂度边注已从界面隐藏，方便先玩懂核心玩法。</li>
                    <li><strong>独立事件：</strong>每次掷骰都是独立的，过去的结果不影响未来。</li>
                </ul>

                <div style={{
                    background: 'rgba(142, 36, 170, 0.15)',
                    borderRadius: 10, padding: 15, marginTop: 15,
                    border: '1px solid rgba(142, 36, 170, 0.3)',
                }}>
                    <strong>💡 教育提示：</strong>
                    最明智的下注仍然是「大」或「小」，赌场优势仅 2.78%，与百家乐的庄家下注接近。
                    这版界面优先保留低门槛选项，减少因为高赔率边注带来的误判。
                </div>
            </div>
        </div>
    );
};
