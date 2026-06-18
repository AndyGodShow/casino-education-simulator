import type { ReactNode } from 'react';
import styles from './SportsUi.module.css';

type ExpandablePanelProps = {
  title: string;
  summary?: string;
  children: ReactNode;
  defaultOpen?: boolean;
};

export function ExpandablePanel({ title, summary, children, defaultOpen = false }: ExpandablePanelProps) {
  return (
    <details className={styles.expandablePanel} open={defaultOpen}>
      <summary>
        <span>{title}</span>
        {summary && <small>{summary}</small>}
      </summary>
      <div className={styles.expandableBody}>{children}</div>
    </details>
  );
}
