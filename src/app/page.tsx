import styles from "./page.module.css";

export default function Home() {
  const items = [
    {
      name: "Bone Chips",
      image: "/items/bone_chips.svg",
      quantity: 10,
      monster: "Decaying Skeleton",
    },
    {
      name: "Spider Silk",
      image: "/items/spider_silk.svg",
      quantity: 5,
      monster: "Spiderling",
    },
    {
      name: "Orc Scalp",
      image: "/items/orc_scalp.svg",
      quantity: 8,
      monster: "Orc Warrior",
    },
  ];

  const monsters = Array.from(new Set(items.map((item) => item.monster)));

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
