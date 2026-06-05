import { describe, expect, it } from 'vitest';
import { SLOT_EDU_CONTENT, SLOT_RTP_RULE_COPY } from './SlotCopy';

describe('slot RTP copy', () => {
    it('does not present the demo slot configuration as 95% RTP', () => {
        const educationCopy = JSON.stringify(SLOT_EDU_CONTENT);

        expect(SLOT_RTP_RULE_COPY).toContain('演示配置');
        expect(SLOT_RTP_RULE_COPY).toContain('58%');
        expect(SLOT_RTP_RULE_COPY).not.toContain('95%');
        expect(educationCopy).toContain('当前演示配置');
        expect(educationCopy).not.toContain('典型 RTP 约 95%');
    });
});
