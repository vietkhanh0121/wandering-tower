import { publicPath } from "./assets";

const SPRITE_BASE = "assets/sprites";

export function spritePath(name) {
  return publicPath(`${SPRITE_BASE}/${name}.png`);
}

export function tileSpritePath(tile) {
  if (tile.terrainSprite) return spritePath(`terrain/${tile.terrainSprite}`);
  return spritePath("terrain/grass1");
}
