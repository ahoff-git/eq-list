"use client";

import { useState } from "react";
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

  const [checked, setChecked] = useState<string[]>([]);

  const toggleItem = (name: string) => {
    setChecked((prev) =>
      prev.includes(name)
        ? prev.filter((n) => n !== name)
        : [...prev, name]
    );
  };

  const monsters = Array.from(
    new Set(
      items
        .filter((item) => checked.includes(item.name))
        .flatMap((item) => item.sources)
    )
  );

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>EverQuest Item Tracker</h1>
      <div className={styles.grids}>
        <div className={styles.grid}>
          {items.map((item) => (
            <div key={item.name} className={styles.itemRow}>
              <input
                type="checkbox"
                checked={checked.includes(item.name)}
                onChange={() => toggleItem(item.name)}
              />
              <img
                src={item.image}
                alt={item.name}
                className={styles.itemImage}
              />
              <div className={styles.itemName}>{item.name}</div>
              <div className={styles.itemQuantity}>Need: {item.quantity}</div>
            </div>
          ))}
        </div>
        <div className={styles.grid}>
          {monsters.map((monster) => (
            <div key={monster} className={styles.monster}>
              <div className={styles.name}>{monster}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
