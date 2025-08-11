"use client";

import { useState } from "react";
import styles from "./page.module.css";

type Item = {
  name: string;
  image: string;
  quantity: number;
  sources: string[];
};

type Recipe = {
  name: string;
  items: Item[];
};

const recipes: Recipe[] = [
  {
    name: "Tranquilsong Bard Gear",
    items: [
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
    ],
  },
];

export default function Home() {
  const [items, setItems] = useState<Item[]>([]);
  const [checked, setChecked] = useState<string[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<string>("");

  const handleAddRecipe = () => {
    const recipe = recipes.find((r) => r.name === selectedRecipe);
    if (!recipe) return;

    setItems((prev) => {
      const existing = new Set(prev.map((i) => i.name));
      const updated = [...prev];
      recipe.items.forEach((item) => {
        if (!existing.has(item.name)) {
          updated.push(item);
        }
      });
      return updated;
    });
  };

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
      <div className={styles.recipeSelector}>
        <select
          value={selectedRecipe}
          onChange={(e) => setSelectedRecipe(e.target.value)}
        >
          <option value="">Select a recipe</option>
          {recipes.map((recipe) => (
            <option key={recipe.name} value={recipe.name}>
              {recipe.name}
            </option>
          ))}
        </select>
        <button onClick={handleAddRecipe} disabled={!selectedRecipe}>
          Add Recipe
        </button>
      </div>
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
