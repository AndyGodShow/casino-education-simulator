import styles from '../SportsLobby.module.css';

type ComingSoonCardProps = {
  title: string;
  description: string;
};

export function ComingSoonCard({ title, description }: ComingSoonCardProps) {
  return (
    <article className={styles.sportCard} aria-disabled="true">
      <span className={styles.statusSoon}>即将开放</span>
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
}
