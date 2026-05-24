import { TILE_STEP_Y, TOWER_LEVEL_HEIGHT, TOWER_MAX_LEVEL, ringPositions } from "./tower-layout";

export const WIZARD_EMPTY_TILE_LEVEL = -1;
export const WIZARD_STAND_OFFSET_Y = -72;
export const WIZARD_EMPTY_TILE_EXTRA_OFFSET_Y = 12;

export const WIZARD_SLOT_ROWS = [
  {
    row: 1,
    name: "top",
    y: 0,
    positions: [
      { position: 0, x: 0 },
      { position: 1, x: -11 },
      { position: 2, x: 11 }
    ]
  },
  {
    row: 2,
    name: "bottom",
    y: 24,
    positions: [
      { position: 0, x: 0 },
      { position: 1, x: -11 },
      { position: 2, x: 11 }
    ]
  }
];

export const WIZARD_SLOT_LAYOUTS_BY_COUNT = {
  1: [{ row: 2, position: 0 }],
  2: [{ row: 2, position: 1 }, { row: 2, position: 2 }],
  3: [{ row: 2, position: 1 }, { row: 2, position: 2 }, { row: 1, position: 0 }],
  4: [{ row: 2, position: 1 }, { row: 2, position: 2 }, { row: 1, position: 1 }, { row: 1, position: 2 }]
};

function clampTowerLevel(level) {
  if (level === WIZARD_EMPTY_TILE_LEVEL) return WIZARD_EMPTY_TILE_LEVEL;
  return Math.max(0, Math.min(TOWER_MAX_LEVEL, Math.round(level)));
}

export function wizardLevelAnchorY(level, towerLevelHeight = TOWER_LEVEL_HEIGHT) {
  const clampedLevel = clampTowerLevel(level);
  const towerOffset = clampedLevel === WIZARD_EMPTY_TILE_LEVEL ? towerLevelHeight + WIZARD_EMPTY_TILE_EXTRA_OFFSET_Y : -clampedLevel * towerLevelHeight;
  return towerOffset + WIZARD_STAND_OFFSET_Y;
}

export function wizardSlotOffset(row, position) {
  const slotRow = WIZARD_SLOT_ROWS.find((item) => item.row === row) ?? WIZARD_SLOT_ROWS[0];
  const slotPosition = slotRow.positions.find((item) => item.position === position) ?? slotRow.positions[0];
  return {
    row: slotRow.row,
    position: slotPosition.position,
    x: slotPosition.x,
    y: slotRow.y
  };
}

export function wizardStackSlot(index, totalCount = index + 1) {
  const layout = WIZARD_SLOT_LAYOUTS_BY_COUNT[Math.max(1, Math.min(4, totalCount))] ?? WIZARD_SLOT_LAYOUTS_BY_COUNT[4];
  const slot = layout[index % layout.length];
  return wizardSlotOffset(slot.row, slot.position);
}

export function wizardPoint({ tileIndex, level = WIZARD_EMPTY_TILE_LEVEL, row = 2, position = 1, options } = {}) {
  const positions = ringPositions((tileIndex ?? 0) + 1, options);
  const tile = positions[tileIndex];
  if (!tile) return null;

  const slot = wizardSlotOffset(row, position);
  const towerLevelHeight = options?.towerLevelHeight ?? TOWER_LEVEL_HEIGHT;
  return {
    tileIndex,
    level: clampTowerLevel(level),
    row: slot.row,
    position: slot.position,
    x: tile.x + slot.x,
    y: tile.y + wizardLevelAnchorY(level, towerLevelHeight) + slot.y
  };
}

export function wizardTilePoints(count, options = {}) {
  const tileCount = Math.max(0, count);
  const tilePositions = ringPositions(tileCount, {
    tileStepY: options.tileStepY ?? TILE_STEP_Y,
    towerLevelHeight: options.towerLevelHeight ?? TOWER_LEVEL_HEIGHT
  });
  const levels = [WIZARD_EMPTY_TILE_LEVEL, ...Array.from({ length: TOWER_MAX_LEVEL + 1 }, (_, level) => level)];

  return tilePositions.map((tile, tileIndex) => ({
    tileIndex,
    levels: levels.map((level) => ({
      level,
      rows: WIZARD_SLOT_ROWS.map((row) => ({
        row: row.row,
        name: row.name,
        positions: row.positions.map((position) => ({
          position: position.position,
          x: tile.x + position.x,
          y: tile.y + wizardLevelAnchorY(level, options.towerLevelHeight) + row.y
        }))
      }))
    }))
  }));
}
