import React from 'react';
import { RulesModal } from '../../../components/RulesModal/RulesModal';
import { SYMBOL_EMOJI, PAYTABLE, PAYLINE_PATTERNS } from '../types';
import type { SlotSymbol } from '../types';
import { SLOT_RTP_RULE_COPY } from '../logic/SlotCopy';

interface SlotRulesModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const symbolOrder: SlotSymbol[] = ['wild', 'seven', 'diamond', 'bell', 'grape', 'orange', 'lemon', 'cherry'];

export const SlotRulesModal: React.FC<SlotRulesModalProps> = ({ isOpen, onClose }) => (
    <RulesModal isOpen={isOpen} onClose={onClose} title="🎰 老虎机规则">
        <section>
            <h3>基本规则</h3>
            <ul>
                <li>5 个卷轴，每个卷轴 3 个符号位</li>
                <li>最多 20 条赔付线</li>
                <li>从最左侧卷轴开始，连续匹配 3 个及以上相同符号即可中奖</li>
                <li>⭐(WILD) 可替代任意其它符号</li>
                <li>中奖金额 = 每线下注 × 赔率倍数</li>
            </ul>
        </section>

        <section>
            <h3>赔付表</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                    <tr>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid rgba(214,176,92,0.35)' }}>符号</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid rgba(214,176,92,0.35)' }}>×3</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid rgba(214,176,92,0.35)' }}>×4</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid rgba(214,176,92,0.35)' }}>×5</th>
                    </tr>
                </thead>
                <tbody>
                    {symbolOrder.map(symbol => (
                        <tr key={symbol}>
                            <td style={{ padding: '8px', borderBottom: '1px solid var(--border-subtle)' }}>{SYMBOL_EMOJI[symbol]} {symbol === 'wild' ? '(WILD)' : ''}</td>
                            <td style={{ padding: '8px', borderBottom: '1px solid var(--border-subtle)' }}>{PAYTABLE[symbol][0]}x</td>
                            <td style={{ padding: '8px', borderBottom: '1px solid var(--border-subtle)' }}>{PAYTABLE[symbol][1]}x</td>
                            <td style={{ padding: '8px', borderBottom: '1px solid var(--border-subtle)' }}>{PAYTABLE[symbol][2]}x</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </section>

        <section>
            <h3>赔付线示例</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' }}>
                {PAYLINE_PATTERNS.slice(0, 5).map((pattern, idx) => (
                    <div key={idx} style={{
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: '8px',
                        padding: '8px',
                        textAlign: 'center',
                    }}>
                        <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '4px' }}>
                            线 {idx + 1}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '2px' }}>
                            {pattern.map((row, col) => (
                                <div key={col} style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                    {[0, 1, 2].map(r => (
                                        <div key={r} style={{
                                            width: '16px',
                                            height: '16px',
                                            borderRadius: '3px',
                                            background: r === row
                                                ? 'linear-gradient(135deg, #d4af37, #b8860b)'
                                                : 'rgba(255,255,255,0.05)',
                                            border: r === row
                                                ? '1px solid #ffd700'
                                                : '1px solid rgba(255,255,255,0.08)',
                                        }} />
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </section>

        <section>
            <h3>数学原理</h3>
            <ul>
                <li>老虎机通过加权随机数生成器决定每次旋转结果</li>
                <li>每个符号出现的概率不同 — 高赔符号概率更低</li>
                <li>{SLOT_RTP_RULE_COPY}</li>
                <li>这是高赌场优势的教学配置，每一次旋转完全独立</li>
                <li>真实赌场中，老虎机 RTP 通常在 85%-98% 之间，本演示配置不代表真实机台</li>
            </ul>
        </section>
    </RulesModal>
);
