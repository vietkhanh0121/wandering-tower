import { useMemo } from "react";

export function useForbiddenTargeting({ game, pendingForbidden, selectableIds, selectedType }) {
  const { forbiddenSelectableIds, forbiddenSelectedType } = useMemo(() => {
    if (!pendingForbidden || !game) return { forbiddenSelectableIds: null, forbiddenSelectedType: null };
    const { targetType, firstTarget } = pendingForbidden;
    const activeId = game.turnOrder[game.currentPlayerIndex];
    let ids;
    let type;

    switch (targetType) {
      case "own-wizard":
        ids = new Set(game.wizards.filter((w) => w.playerId === activeId && !w.safe && !w.capturedBy && w.tileIndex != null).map((w) => w.id));
        type = "wizard";
        break;
      case "wizard-swap":
        ids = new Set(game.wizards
          .filter((w) => {
            if (w.safe || w.capturedBy || w.tileIndex == null) return false;
            return firstTarget == null ? w.playerId === activeId : w.playerId !== activeId;
          })
          .map((w) => w.id));
        type = "wizard";
        break;
      case "opponent-wizard-dice":
        ids = new Set(game.wizards.filter((w) => w.playerId !== activeId && !w.safe && !w.capturedBy && w.tileIndex != null).map((w) => w.id));
        type = "wizard";
        break;
      case "raven-tower":
        ids = new Set(game.towers.filter((t) => t.kind === "tower" && (t.hasRaven || t.tempRaven)).map((t) => t.id));
        type = "tower";
        break;
      case "imprisoning-tower":
        ids = new Set(game.wizards.filter((w) => w.playerId === activeId && w.capturedBy).map((w) => w.capturedBy));
        type = "tower";
        break;
      case "imprisoning-stack": {
        const prisonTileIndexes = new Set(game.wizards
          .filter((w) => w.capturedBy)
          .map((w) => game.towers.find((t) => t.id === w.capturedBy)?.tileIndex)
          .filter((tileIndex) => tileIndex != null));
        ids = new Set(game.towers
          .filter((t) => t.kind === "tower" && prisonTileIndexes.has(t.tileIndex))
          .map((t) => {
            const stack = game.towers
              .filter((item) => item.tileIndex === t.tileIndex && item.kind === "tower")
              .sort((a, b) => a.level - b.level);
            return stack[stack.length - 1]?.id;
          })
          .filter(Boolean));
        type = "tower";
        break;
      }
      case "any-tower":
        ids = new Set(game.towers.filter((t) => t.kind === "tower").map((t) => t.id));
        type = "tower";
        break;
      case "normal-tower":
        ids = new Set(game.towers.filter((t) => t.kind === "tower" && !t.hasRaven && !t.tempRaven).map((t) => t.id));
        type = "tower";
        break;
      case "tile": {
        const tilesWithTowers = new Set(game.towers.filter((t) => t.kind === "tower").map((t) => t.tileIndex));
        if (firstTarget != null) {
          const firstTileIdx = parseInt(firstTarget.toString().replace("tile-", ""));
          tilesWithTowers.delete(firstTileIdx);
        }
        ids = new Set([...tilesWithTowers].map((tileIndex) => `tile-${tileIndex}`));
        type = "tile";
        break;
      }
      default:
        ids = new Set();
        type = "tower";
    }

    return { forbiddenSelectableIds: ids, forbiddenSelectedType: type };
  }, [pendingForbidden, game]);

  const highlightedTileIds = useMemo(() => {
    if (pendingForbidden?.targetType !== "tile" || pendingForbidden.firstTarget == null) return new Set();
    return new Set([targetToTileId(game, pendingForbidden.firstTarget)]);
  }, [game, pendingForbidden]);
  const highlightedTowerIds = useMemo(() => {
    if (pendingForbidden?.spellId !== "top-tower-swap" || pendingForbidden.firstTarget == null) return new Set();
    const towerId = resolveTileToTopTower(game, pendingForbidden.firstTarget);
    const top = game?.towers.find((tower) => tower.id === towerId);
    if (!top) return new Set();
    if (top.kind !== "keep") return new Set([top.id]);

    const supportTower = towerStack(game, top.tileIndex).at(-2);
    return new Set([top.id, supportTower?.id].filter(Boolean));
  }, [game, pendingForbidden]);
  const highlightedTileTone = pendingForbidden?.spellId === "top-tower-swap" ? "gold" : "default";

  return {
    effectiveSelectableIds: pendingForbidden ? (forbiddenSelectableIds ?? new Set()) : selectableIds,
    effectiveSelectedType: pendingForbidden ? (forbiddenSelectedType ?? "tower") : selectedType,
    highlightedTileIds,
    highlightedTowerIds,
    highlightedTileTone,
    resolveTileToTopTower: (tileKey) => resolveTileToTopTower(game, tileKey)
  };
}

function targetToTileId(game, targetId) {
  if (targetId?.toString().startsWith("tile-")) return targetId;
  const tower = game?.towers.find((item) => item.id === targetId);
  return tower ? `tile-${tower.tileIndex}` : targetId;
}

function resolveTileToTopTower(game, tileKey) {
  if (!tileKey?.toString().startsWith("tile-")) return tileKey;
  const tileIndex = parseInt(tileKey.toString().replace("tile-", ""));
  return game.towers.filter((tower) => tower.tileIndex === tileIndex).sort((a, b) => b.level - a.level)[0]?.id ?? null;
}

function towerStack(game, tileIndex) {
  return game.towers
    .filter((tower) => tower.tileIndex === tileIndex)
    .sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      if (a.kind === b.kind) return 0;
      return a.kind === "keep" ? 1 : -1;
    });
}
