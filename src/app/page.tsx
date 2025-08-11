import styles from "./page.module.css";

export default function Home() {
  const items = [
    {
      name: "Bone Chips",
      image: "/items/bone_chips.svg",
      quantity: 10,
      sources: ["Decaying Skeleton", "Skeleton Warrior"],
    },
    {
      name: "Spider Silk",
      image: "/items/spider_silk.svg",
      quantity: 5,
      sources: ["Spiderling", "Giant Spider"],
    },
    {
      name: "Orc Scalp",
      image: "/items/orc_scalp.svg",
      quantity: 8,
      sources: ["Orc Warrior", "Orc Centurion"],
    },
  ];

  const monsters = Array.from(new Set(items.flatMap((item) => item.sources)));

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>EverQuest Item Tracker</h1>
      <div className={styles.grids}>
        <div className={styles.grid}>
          {items.map((item) => (
            <div key={item.name} className={styles.card}>
              <img src={item.image} alt={item.name} className={styles.image} />
              <div className={styles.name}>{item.name}</div>
              <div className={styles.quantity}>Need: {item.quantity}</div>
              <div className={styles.sources}>
                Dropped by: {item.sources.join(", ")}
              </div>
            </div>
          ))}
        </div>
        <div className={styles.grid}>
          {monsters.map((monster) => (
            <div key={monster} className={styles.card}>
              <div className={styles.name}>{monster}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
