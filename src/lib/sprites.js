import { publicPath } from "./assets";

const SPRITE_BASE = "assets/sprites";

const TILE_SPRITES_BY_BIOME = {
  chapel: "stone-road",
  crystal: "rock",
  dock: "dock",
  ember: "sand",
  forest: "grass",
  gate: "road",
  lantern: "road",
  marsh: "shore",
  orchard: "grass",
  plaza: "stone-road",
  road: "road",
  stone: "stone-road",
  thorn: "rock",
  tower: "rock",
  town: "dock",
  water: "water"
};

const TILE_SPRITES_BY_ID = {
  "black-market": "crab",
  "moon-well": "deep-water",
  "salt-marsh": "shore"
};

export function spritePath(name) {
  return publicPath(`${SPRITE_BASE}/${name}.png`);
}

export function tileSpritePath(tile) {
  if (tile.terrainSprite) return spritePath(`terrain/${tile.terrainSprite}`);
  const spriteName = TILE_SPRITES_BY_ID[tile.id] ?? TILE_SPRITES_BY_BIOME[tile.biome] ?? "grass";
  return spritePath(`tiles/${spriteName}`);
}
