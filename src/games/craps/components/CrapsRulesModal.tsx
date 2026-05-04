// ===== 花旗骰规则弹窗 =====
import React from 'react';

interface Props { isOpen: boolean; onClose: () => void; }

export const CrapsRulesModal: React.FC<Props> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
            <div style={{ background: 'linear-gradient(135deg, #1a1a2e, #16213e)', borderRadius: 20, padding: '30px 35px', maxWidth: 650, maxHeight: '80vh', overflowY: 'auto', border: '1px solid rgba(27,94,32,0.3)', color: '#ddd', lineHeight: 1.7 }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h2 style={{ color: '#fff', margin: 0 }}>🎲 花旗骰规则</h2>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                </div>

                <h3 style={{ color: '#4caf50' }}>游戏简介</h3>
                <p>花旗骰（Craps）是西方赌场常见的骰子游戏，使用两颗骰子，有独特的两阶段机制。</p>

                <h3 style={{ color: '#4caf50' }}>第一阶段：开局骰</h3>
                <ul style={{ paddingLeft: 20 }}>
                    <li><strong>7 或 11</strong>：自然胜，过线注赢</li>
                    <li><strong>2, 3, 12</strong>：花旗点，过线注输</li>
                    <li><strong>4,5,6,8,9,10</strong>：设定目标点，进入第二阶段</li>
                </ul>

                <h3 style={{ color: '#4caf50' }}>第二阶段：目标点阶段</h3>
                <ul style={{ paddingLeft: 20 }}>
                    <li>重复掷骰，直到掷出 <strong>目标点</strong> 或 <strong>7</strong></li>
                    <li>掷到目标点 → 过线注赢</li>
                    <li>掷到 7 → 七点出局，过线注输</li>
                </ul>

                <h3 style={{ color: '#4caf50' }}>下注类型与赔率</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 15, fontSize: '0.85rem' }}>
                    <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                        <th style={{ textAlign: 'left', padding: 8, color: '#aaa' }}>下注</th>
                        <th style={{ textAlign: 'center', padding: 8, color: '#ffd700' }}>赔率</th>
                        <th style={{ textAlign: 'center', padding: 8, color: '#aaa' }}>赌场优势</th>
                    </tr></thead>
                    <tbody>
                        {[
                            ['过线注', '1:1', '1.41%'],
                            ['反过线注', '1:1', '1.36%'],
                            ['来注 / 反来注', '1:1', '1.41% / 1.36%'],
                            ['区域注', '1:1 / 2:1', '5.56%'],
                            ['任意七', '4:1', '16.67%'],
                            ['任意花旗点', '7:1', '11.11%'],
                        ].map(([t, o, e], i) => (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: 8, fontWeight: 'bold' }}>{t}</td>
                                <td style={{ padding: 8, textAlign: 'center', color: '#ffd700' }}>{o}</td>
                                <td style={{ padding: 8, textAlign: 'center' }}>{e}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div style={{ background: 'rgba(27,94,32,0.15)', borderRadius: 10, padding: 15, border: '1px solid rgba(27,94,32,0.3)' }}>
                    <strong>💡 教育提示：</strong>过线注和反过线注是赌场优势最低的下注（约 1.4%），甚至优于百家乐的庄闲。任意七看似简单但赌场优势高达 16.67%，是花旗骰中最差的选择之一。
                </div>
            </div>
        </div>
    );
};
