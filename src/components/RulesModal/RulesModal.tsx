import React, {
    type ReactNode,
    useEffect,
    useId,
    useRef,
} from 'react';
import styles from './RulesModal.module.css';

interface RulesModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
}

export const RulesModal: React.FC<RulesModalProps> = ({ isOpen, onClose, title, children }) => {
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const closeButtonRef = useRef<HTMLButtonElement | null>(null);
    const titleId = useId();

    useEffect(() => {
        if (!isOpen) return undefined;

        const opener = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeButtonRef.current?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab') return;

            const focusableElements = Array.from(
                dialogRef.current?.querySelectorAll<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
                ) ?? [],
            );
            if (focusableElements.length === 0) {
                event.preventDefault();
                dialogRef.current?.focus();
                return;
            }

            const firstFocusable = focusableElements[0];
            const lastFocusable = focusableElements[focusableElements.length - 1];
            const activeElement = document.activeElement;
            if (
                !dialogRef.current?.contains(activeElement)
                || (!event.shiftKey && activeElement === lastFocusable)
            ) {
                event.preventDefault();
                firstFocusable.focus();
            } else if (event.shiftKey && activeElement === firstFocusable) {
                event.preventDefault();
                lastFocusable.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', handleKeyDown);
            opener?.focus();
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div
                ref={dialogRef}
                className={styles.modal}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                onClick={e => e.stopPropagation()}
            >
                <button
                    ref={closeButtonRef}
                    className={styles.closeBtn}
                    type="button"
                    aria-label="× 关闭规则弹窗"
                    onClick={onClose}
                >
                    ×
                </button>
                <h2 id={titleId}>{title}</h2>
                <div className={styles.content}>
                    {children}
                </div>
            </div>
        </div>
    );
};
