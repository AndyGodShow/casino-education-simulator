import React, { useEffect, useId, useRef } from 'react';
import './EducationalOverlay.css';

interface EducationalContent {
    title: string;
    sections: {
        subtitle?: string;
        content: string;
        highlights?: string[];
    }[];
}

interface EducationalOverlayProps {
    isOpen: boolean;
    onClose: () => void;
    content: EducationalContent;
}

export const EducationalOverlay: React.FC<EducationalOverlayProps> = ({ isOpen, onClose, content }) => {
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const closeButtonRef = useRef<HTMLButtonElement | null>(null);
    const titleId = useId();
    const descriptionId = useId();

    useEffect(() => {
        if (!isOpen) return undefined;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeButtonRef.current?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }

            if (event.key !== 'Tab') {
                return;
            }

            const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            );

            if (!focusableElements || focusableElements.length === 0) {
                dialogRef.current?.focus();
                event.preventDefault();
                return;
            }

            const firstFocusable = focusableElements[0];
            const lastFocusable = focusableElements[focusableElements.length - 1];
            const activeElement = document.activeElement as HTMLElement | null;

            if (event.shiftKey) {
                if (activeElement === firstFocusable || !dialogRef.current?.contains(activeElement)) {
                    event.preventDefault();
                    lastFocusable.focus();
                }
                return;
            }

            if (activeElement === lastFocusable) {
                event.preventDefault();
                firstFocusable.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="edu-overlay-backdrop" onClick={onClose}>
            <div
                ref={dialogRef}
                className="edu-overlay-content"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                tabIndex={-1}
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    ref={closeButtonRef}
                    className="edu-close-btn"
                    onClick={onClose}
                    aria-label="关闭教育弹窗"
                    type="button"
                >
                    &times;
                </button>
                <div className="edu-header">
                    <span className="edu-badge">🎓 教育研究</span>
                    <h2 id={titleId}>{content.title}</h2>
                </div>
                <div className="edu-scroll-area" id={descriptionId}>
                    {content.sections.map((section, idx) => (
                        <div key={idx} className="edu-section">
                            {section.subtitle && <h3>{section.subtitle}</h3>}
                            <p>{section.content}</p>
                            {section.highlights && (
                                <ul className="edu-highlights">
                                    {section.highlights.map((h, i) => <li key={i}>{h}</li>)}
                                </ul>
                            )}
                        </div>
                    ))}
                </div>
                <div className="edu-footer">
                    <p>知识提示：长期下注高赌场期望值的选项（如和局）通常是亏损的主要原因。</p>
                </div>
            </div>
        </div>
    );
};
