import { writeFileSync } from "node:fs";

const values = [1, 2, 3];
const patterns = ["wizard", "tower", "both", "both"];
const diceBookConfigs = [
  ...Array.from({ length: 4 }, () => ({ type: "wizard", diceRolls: 1 })),
  ...Array.from({ length: 2 }, () => ({ type: "wizard", diceRolls: 2 })),
  ...Array.from({ length: 4 }, () => ({ type: "tower", diceRolls: 1 })),
  ...Array.from({ length: 2 }, () => ({ type: "tower", diceRolls: 2 })),
];
const diceBookByIndex = new Map(
  diceBookConfigs.map((config, index) => [
    Math.floor((index + 0.5) * 80 / diceBookConfigs.length),
    config
  ])
);
const books = Array.from({ length: 80 }, (_, index) => {
  const towerValue = values[index % values.length];
  const wizardValue = values[Math.floor(index / values.length) % values.length];
  const pattern = patterns[index % patterns.length];
  const diceBook = diceBookByIndex.get(index) ?? null;
  const pages = [];

  if (diceBook) {
    pages.push(diceBook);
  } else {
    if (pattern === "tower" || pattern === "both") {
      pages.push({ type: "tower", value: towerValue });
    }

    if (pattern === "wizard" || pattern === "both") {
      pages.push({ type: "wizard", value: wizardValue });
    }
  }

  return {
    id: `spellbook-${String(index + 1).padStart(2, "0")}`,
    name: `Sách Phép ${String(index + 1).padStart(2, "0")}`,
    pages
  };
});

writeFileSync(
  new URL("../public/data/spellbooks.json", import.meta.url),
  `${JSON.stringify(books, null, 2)}\n`
);
