export const TOWER_MAX_LEVEL = 8;
export const TOWER_LEVEL_HEIGHT = 12;
export const HEX_WIDTH = 66;
export const TILE_STEP_X = HEX_WIDTH;
export const TILE_STEP_Y = 65;
export const TOWER_CENTER_OFFSET = { x: 0, y: -19 };

export const MAP_TILE_COORDS = [
  [0, -2], [1, -2], [2, -2],
  [2, -1], [2, 0],
  [1, 1], [0, 2], [-1, 2],
  [-2, 2], [-2, 1],
  [-2, 0], [-1, -1]
];

function towerLevelPoints(towerLevelHeight = TOWER_LEVEL_HEIGHT) {
  return Array.from({ length: TOWER_MAX_LEVEL + 1 }, (_, level) => ({
    level,
    height: level * towerLevelHeight,
    x: 0,
    y: -level * towerLevelHeight
  }));
}

function mapTilePoints({ tileStepY = TILE_STEP_Y, towerLevelHeight = TOWER_LEVEL_HEIGHT } = {}) {
  const levelPoints = towerLevelPoints(towerLevelHeight);
  return MAP_TILE_COORDS.map(([q, r], index) => {
  const x = TILE_STEP_X * (q + r / 2);
  const y = tileStepY * r;
  return {
    index,
    q,
    r,
    x,
    y,
    row: r,
    zIndex: 100 + (r + 2) * 20 - q,
    towerLevels: levelPoints.map((point) => ({
      level: point.level,
      x: x + TOWER_CENTER_OFFSET.x + point.x,
      y: y + TOWER_CENTER_OFFSET.y + point.y,
      height: point.height
    }))
  };
  });
}

export const TOWER_LEVEL_POINTS = towerLevelPoints();
export const MAP_TILE_POINTS = mapTilePoints();

export function towerLevelPoint(level) {
  const index = Math.max(0, Math.min(TOWER_MAX_LEVEL, Math.round(level)));
  return TOWER_LEVEL_POINTS[index];
}

export function ringPositions(count, options) {
  return mapTilePoints(options).slice(0, count).map(({ x, y, row, zIndex }) => ({ x, y, row, zIndex }));
}

export function towerTileLevelPoint(tileIndex, level, options) {
  const tile = mapTilePoints(options)[tileIndex];
  if (!tile) return null;
  const index = Math.max(0, Math.min(TOWER_MAX_LEVEL, Math.round(level)));
  return tile.towerLevels[index];
}
