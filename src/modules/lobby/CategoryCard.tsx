import type { CSSProperties, ReactNode } from 'react';
import styles from './MainLobby.module.css';

type CategoryCardProps = {
  title: string;
  eyebrow: string;
  description: string;
  focus: string;
  meta: string;
  accent: string;
  onSelect: () => void;
  children?: ReactNode;
};

export function CategoryCard({
  title,
  eyebrow,
  description,
  focus,
  meta,
  accent,
  onSelect,
  children,
}: CategoryCardProps) {
  return (
    <button
      className={styles.categoryCard}
      type="button"
      onClick={onSelect}
      style={{ '--category-accent': accent } as CSSProperties}
    >
      <span className={styles.categoryEyebrow}>{eyebrow}</span>
      <span className={styles.categoryTitle}>{title}</span>
      <span className={styles.categoryDescription}>{description}</span>
      <span className={styles.categoryFocus}>{focus}</span>
      <span className={styles.categoryMeta}>{meta}</span>
      {children}
    </button>
  );
}
