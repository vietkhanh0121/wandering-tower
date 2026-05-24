export const PLAYER_PRESETS = [
  { id: "p1", name: "Blue", color: "#4aa3ff", wizardColor: "blue" },
  { id: "p2", name: "Red", color: "#ff5b5b", wizardColor: "red" },
  { id: "p3", name: "Green", color: "#33c278", wizardColor: "green" },
  { id: "p4", name: "Orange", color: "#ff9a3c", wizardColor: "orange" }
];

const MAX_WIZARDS_PER_LOCATION = 4;
const TERRAIN_GROUPS = [
  { kind: "grass", sprites: ["grass1", "grass2", "grass3"] },
  { kind: "sand", sprites: ["sand1", "sand2", "sand3"] },
  { kind: "water", sprites: ["water", "water2", "water3"] },
  { kind: "snow", sprites: ["snow1", "snow2", "snow3"] }
];

export function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function normalizeStep(value) {
  if (typeof value === "number") return { value, label: String(value), rolls: [] };
  const numericValue = Number(value) || 1;
  return { value: numericValue, label: String(numericValue), rolls: [] };
}

export function buildNewGame({ tiles, forbiddenSpells, spellbooks, playerCount, playerPresets, expansionMode = false }) {
  const boardSize = 12;
  const boardTiles = shuffle(tiles).slice(0, boardSize);
  const terrainSequence = buildGroupedTerrainSequence(boardSize);
  const ravenTileIds = new Set(shuffle(boardTiles).slice(0, 3).map((tile) => tile.id));
  const board = boardTiles.map((tile, index) => ({
    ...tile,
    terrainKind: terrainSequence[index]?.kind ?? "grass",
    terrainSprite: terrainSequence[index]?.sprite ?? "grass1",
    isStart: false,
    hasRaven: ravenTileIds.has(tile.id),
    ringIndex: index
  }));
  const ravenIndexes = board.map((tile, index) => tile.hasRaven ? index : null).filter((index) => index !== null);
  const keepIndex = ravenIndexes[Math.floor(Math.random() * ravenIndexes.length)] ?? 0;
  const towers = normalizeTowerLevels({
    towers: [
    { id: "ravenskeep", name: "Ravenskeep", kind: "keep", hasRaven: false, tileIndex: keepIndex, level: 0 },
    ...Array.from({ length: 7 }, (_, index) => ({
      id: `tower-${index + 1}`,
      name: `Tháp ${index + 1}`,
      kind: "tower",
      hasRaven: index < 2,
      tileIndex: (keepIndex + index + 1) % board.length,
      level: 0
    }))
  ]}).towers;

  const wizardCount = wizardsPerPlayer(playerCount);
  const potionCount = wizardCount;
  const players = (playerPresets ?? PLAYER_PRESETS).slice(0, playerCount).map((player) => ({
    ...player,
    potions: Array.from({ length: potionCount }, (_, index) => ({ id: `${player.id}-potion-${index}`, state: "empty", removed: false })),
    hand: []
  }));

  const wizards = players.flatMap((player) =>
    Array.from({ length: wizardCount }, (_, index) => ({
      id: `${player.id}-wizard-${index + 1}`,
      playerId: player.id,
      name: `P${player.id.slice(1)}-${index + 1}`,
      tileIndex: null,
      standingOn: null,
      capturedBy: null,
      safe: false
    }))
  );

  const deck = shuffle(spellbooks);
  const dealtPlayers = players.map((player) => ({ ...player, hand: deck.splice(0, 3) }));
  const placedWizards = placeStartingWizards({ wizards, board, towers, startIndex: keepIndex, playerIds: dealtPlayers.map((p) => p.id) });

  return {
    board,
    towers,
    players: dealtPlayers,
    wizards: placedWizards,
    deck,
    ...(() => {
      const sf = shuffle([...forbiddenSpells]);
      return { forbidden: sf.slice(0, 3), forbiddenPool: sf.slice(3), forbiddenDiscard: [] };
    })(),
    turnOrder: shuffle(dealtPlayers.map((player) => player.id)),
    currentPlayerIndex: 0,
    actionsRemaining: 2,
    expansionMode,
    selectedSpellId: null,
    selectedAction: null,
    message: "Chào mừng đến với Wandering Tower với em bé gối!",
    log: ["Ravenskeep xuất hiện ngẫu nhiên trên 1 trong 3 ô Raven. Tháp và Pháp sư setup theo chiều kim đồng hồ từ Ravenskeep."]
  };
}

function buildGroupedTerrainSequence(boardSize) {
  const groupedSprites = shuffle(TERRAIN_GROUPS).flatMap((group) =>
    shuffle(group.sprites).map((sprite) => ({ kind: group.kind, sprite }))
  );
  if (groupedSprites.length >= boardSize) return groupedSprites.slice(0, boardSize);
  return Array.from({ length: boardSize }, (_, index) => groupedSprites[index % groupedSprites.length]);
}

function wrapBoardIndex(index, boardSize) {
  return ((index % boardSize) + boardSize) % boardSize;
}

function recordLastMoves(game, moves) {
  game.lastMoves = moves.filter(Boolean);
}

function moveRecord(type, id, fromTileIndex, toTileIndex, steps) {
  return {
    type,
    id,
    fromTileIndex,
    toTileIndex,
    steps,
    direction: steps < 0 ? -1 : 1
  };
}

function placeStartingWizards({ wizards, board, towers, startIndex, playerIds }) {
  const placed = wizards.map((wizard) => ({ ...wizard }));
  const queues = new Map(playerIds.map((id) => [id, placed.filter((wizard) => wizard.playerId === id)]));
  const setupGame = { board, towers, wizards: placed };
  let guard = 0;

  for (let offset = 1; offset <= board.length && guard < 200; offset += 1) {
    const tileIndex = (startIndex + offset) % board.length;
    const needed = board[tileIndex].lanterns;
    for (let slot = 0; slot < needed; slot += 1) {
      const playerId = playerIds[(offset + slot - 1) % playerIds.length];
      const queue = queues.get(playerId);
      const wizard = queue?.shift();
      if (wizard) {
        wizard.tileIndex = tileIndex;
        wizard.standingOn = topTower(setupGame, tileIndex)?.id ?? null;
      }
      guard += 1;
    }
  }

  return placed;
}

export function currentPlayer(game) {
  return game.players.find((player) => player.id === game.turnOrder[game.currentPlayerIndex]);
}

export function tileOccupants(game, tileIndex) {
  return game.wizards.filter((wizard) => wizard.tileIndex === tileIndex && !wizard.safe && !wizard.capturedBy);
}

export function towerStack(game, tileIndex) {
  return game.towers.filter((tower) => tower.tileIndex === tileIndex).sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    if (a.kind === b.kind) return 0;
    return a.kind === "keep" ? 1 : -1;
  });
}

export function topTower(game, tileIndex) {
  const stack = towerStack(game, tileIndex);
  return stack[stack.length - 1] ?? null;
}

function activeMistVeil(game) {
  return game.mistVeil?.playerId && !game.mistVeil.expiring ? game.mistVeil : null;
}

function mistBlocksKeepEntry(game, destination) {
  const keep = game.towers.find((tower) => tower.kind === "keep");
  return Boolean(activeMistVeil(game) && keep && destination === keep.tileIndex);
}

function mistBlockedMessage() {
  return "Không thể thực hiện nước đi";
}

export function legalTargets(game, playerId, type) {
  if (type === "wizard") {
    return game.wizards.filter((wizard) => wizard.playerId === playerId && !wizard.safe && !wizard.capturedBy && wizard.tileIndex != null);
  }

  return game.towers.filter((tower) => tower.kind === "tower");
}

export function moveWizard(game, wizardId, rawValue) {
  const wizard = game.wizards.find((item) => item.id === wizardId);
  if (!wizard || wizard.safe || wizard.capturedBy || wizard.tileIndex == null) return withMessage(game, "Không thể thực hiện nước đi");
  const activePlayerId = game.turnOrder[game.currentPlayerIndex];
  const bonus = game.players.find((p) => p.id === activePlayerId)?.bonusStep ?? 0;
  const step = normalizeStep(rawValue);
  const signedSteps = step.value + bonus;
  const destination = wrapBoardIndex(wizard.tileIndex + signedSteps, game.board.length);
  if (tileOccupants(game, destination).length >= MAX_WIZARDS_PER_LOCATION) return withMessage(game, "Không thể thực hiện nước đi");
  const keep = game.towers.find((tower) => tower.kind === "keep");
  if (mistBlocksKeepEntry(game, destination)) return withMessage(game, mistBlockedMessage());

  const next = cloneGame(game);
  if (bonus > 0) { const ap = next.players.find((p) => p.id === activePlayerId); if (ap) delete ap.bonusStep; }
  const moved = next.wizards.find((item) => item.id === wizardId);
  recordLastMoves(next, [moveRecord("wizard", wizardId, wizard.tileIndex, destination, signedSteps)]);
  moved.tileIndex = destination;
  moved.standingOn = topTower(next, destination)?.id ?? null;

  if (destination === keep.tileIndex) {
    moved.safe = true;
    moved.tileIndex = null;
    moved.standingOn = null;
    if (!winner(next)) moveKeepToNearestLanding(next, destination);
    next.actionsRemaining = 0;
    next.message = `${moved.name} vào Tháp Đen an toàn.`;
    next.log.unshift(next.message);
    return finishAction(next, { forceEnd: true });
  }

  const tower = topTower(next, destination);
  moveWizardToRenderTop(next, wizardId);
  next.message = `${moved.name} di chuyển Pháp sư.`;
  next.log.unshift(next.message);
  return finishAction(next);
}

export function moveWizardToRenderTop(game, wizardId) {
  const index = game.wizards.findIndex((wizard) => wizard.id === wizardId);
  if (index < 0) return;
  const [wizard] = game.wizards.splice(index, 1);
  game.wizards.push(wizard);
}

function applyWizardMoveInPlace(game, wizardId, steps) {
  const wizard = game.wizards.find((item) => item.id === wizardId);
  if (!wizard || wizard.safe || wizard.capturedBy || wizard.tileIndex == null) return "Không thể thực hiện nước đi";
  const fromTileIndex = wizard.tileIndex;
  const destination = wrapBoardIndex(wizard.tileIndex + steps, game.board.length);
  if (tileOccupants(game, destination).length >= MAX_WIZARDS_PER_LOCATION) return "Không thể thực hiện nước đi";
  const keep = game.towers.find((tower) => tower.kind === "keep");
  if (mistBlocksKeepEntry(game, destination)) return mistBlockedMessage();

  wizard.tileIndex = destination;
  wizard.standingOn = topTower(game, destination)?.id ?? null;
  recordLastMoves(game, [moveRecord("wizard", wizardId, fromTileIndex, destination, steps)]);
  moveWizardToRenderTop(game, wizardId);

  if (destination === keep.tileIndex) {
    wizard.safe = true;
    wizard.tileIndex = null;
    wizard.standingOn = null;
    if (!winner(game)) moveKeepToNearestLanding(game, destination);
  }

  return null;
}

function moveKeepToNearestLanding(game, fromIndex) {
  const keep = game.towers.find((tower) => tower.kind === "keep");
  for (let offset = 1; offset <= game.board.length; offset += 1) {
    const index = (fromIndex + offset) % game.board.length;
    if (hasRavenLanding(game, index) && !hasAnyWizardAtTile(game, index)) {
      keep.tileIndex = index;
      keep.level = game.towers.filter((tower) => tower.id !== keep.id && tower.tileIndex === index).length;
      normalizeTowerLevels(game);
      return;
    }
  }
}

function moveKeepToNearestRavenLanding(game, fromIndex) {
  const keep = game.towers.find((tower) => tower.kind === "keep");
  const boardSize = game.board.length;
  for (let offset = 1; offset <= boardSize; offset += 1) {
    const index = (fromIndex + offset) % boardSize;
    if (hasRavenLanding(game, index) && !hasAnyWizardAtTile(game, index)) {
      keep.tileIndex = index;
      keep.level = game.towers.filter((tower) => tower.id !== keep.id && tower.tileIndex === index).length;
      normalizeTowerLevels(game);
      return;
    }
  }
}

function hasRavenLanding(game, tileIndex) {
  const stack = towerStack(game, tileIndex);
  const top = stack[stack.length - 1];
  if (!top) return Boolean(game.board[tileIndex]?.hasRaven);
  return top?.kind === "tower" && (top.hasRaven || top.tempRaven);
}

function hasAnyWizardAtTile(game, tileIndex) {
  return game.wizards.some((wizard) => !wizard.safe && !wizard.capturedBy && wizard.tileIndex === tileIndex);
}

export function moveTower(game, towerId, rawValue) {
  const tower = game.towers.find((item) => item.id === towerId);
  if (!tower || tower.kind === "keep") return withMessage(game, "Chỉ có thể di chuyển tháp thường.");
  const source = tower.tileIndex;
  const sourceStack = towerStack(game, source);
  const selectedLevel = sourceStack.findIndex((item) => item.id === towerId);
  if (selectedLevel < 0) return withMessage(game, "Không tìm thấy tầng tháp đã chọn.");
  const movingStack = sourceStack.slice(selectedLevel);
  const movingIds = new Set(movingStack.map((item) => item.id));
  const activePlayerId = game.turnOrder[game.currentPlayerIndex];
  const bonus = game.players.find((p) => p.id === activePlayerId)?.bonusStep ?? 0;
  const step = normalizeStep(rawValue);
  const signedSteps = step.value + bonus;
  const destination = wrapBoardIndex(source + signedSteps, game.board.length);
  const keep = game.towers.find((item) => item.kind === "keep");
  const carriesKeep = movingIds.has(keep.id);
  if (!carriesKeep && destination === keep.tileIndex) return withMessage(game, "Tháp không thể kết thúc ở Tháp Đen.");

  const next = cloneGame(game);
  if (bonus > 0) { const ap = next.players.find((p) => p.id === activePlayerId); if (ap) delete ap.bonusStep; }
  const carriedFree = next.wizards.filter((wizard) => (
    wizard.tileIndex === source &&
    !wizard.safe &&
    !wizard.capturedBy &&
    wizard.standingOn &&
    movingIds.has(wizard.standingOn)
  ));
  const carriedFreeIds = new Set(carriedFree.map((wizard) => wizard.id));
  const coveredPrisoners = next.wizards.filter((wizard) => wizard.capturedBy && movingIds.has(wizard.capturedBy));
  const carriedPrisoners = coveredPrisoners.filter((wizard) => isPrisonerCarriedByMovingStack(sourceStack, movingIds, wizard));
  const releasedPrisoners = coveredPrisoners.filter((wizard) => !carriedPrisoners.some((carried) => carried.id === wizard.id));

  next.towers.filter((item) => movingIds.has(item.id)).forEach((item) => {
    item.tileIndex = destination;
  });
  recordLastMoves(next, movingStack.map((item) => moveRecord("tower", item.id, source, destination, signedSteps)));

  const sourceRemaining = towerStack(next, source).filter((item) => !movingIds.has(item.id));
  setStackLevels(next, source, sourceRemaining.map((item) => item.id));
  const destinationBase = towerStack(next, destination).filter((item) => !movingIds.has(item.id));
  setStackLevels(next, destination, [
    ...destinationBase.map((item) => item.id),
    ...movingStack.map((item) => item.id)
  ]);

  releasedPrisoners.forEach((wizard) => {
    wizard.capturedBy = null;
    wizard.tileIndex = source;
    wizard.standingOn = topTower(next, source)?.id ?? null;
  });
  carriedPrisoners.forEach((wizard) => {
    wizard.tileIndex = destination;
  });
  const captured = next.wizards.filter((wizard) => (
    wizard.tileIndex === destination &&
    !wizard.safe &&
    !wizard.capturedBy &&
    !carriedFreeIds.has(wizard.id)
  ));
  captured.forEach((wizard) => {
    wizard.capturedBy = towerId;
  });
  carriedFree.forEach((wizard) => {
    wizard.tileIndex = destination;
  });
  if (captured.length) fillPotion(next, game.turnOrder[game.currentPlayerIndex]);

  const movedNames = movingStack.map((item) => item.name).join(" + ");
  next.message = `${tower.name} di chuyển Tháp.`;
  next.log.unshift(`Stack: ${movedNames}`);
  next.log.unshift(next.message);
  return finishAction(next);
}

function setStackLevels(game, tileIndex, orderedIds) {
  orderedIds.forEach((id, level) => {
    const tower = game.towers.find((item) => item.id === id);
    if (tower && tower.tileIndex === tileIndex) tower.level = level;
  });
}

function isPrisonerCarriedByMovingStack(sourceStack, movingIds, wizard) {
  if (!wizard.standingOn || !wizard.capturedBy) return false;
  if (!movingIds.has(wizard.standingOn) || !movingIds.has(wizard.capturedBy)) return false;
  const standingLevel = sourceStack.findIndex((tower) => tower.id === wizard.standingOn);
  const coveringLevel = sourceStack.findIndex((tower) => tower.id === wizard.capturedBy);
  return standingLevel >= 0 && coveringLevel >= 0 && standingLevel < coveringLevel;
}

function normalizeTowerLevels(game) {
  const tileIndexes = [...new Set(game.towers.map((tower) => tower.tileIndex))];
  tileIndexes.forEach((tileIndex) => {
    towerStack(game, tileIndex).forEach((tower, level) => {
      tower.level = level;
    });
  });
  return game;
}

function wizardsPerPlayer(playerCount) {
  return Math.max(1, 7 - playerCount);
}

function fillPotion(game, playerId) {
  normalizeExpansionPotions(game);
  const player = game.players.find((item) => item.id === playerId);
  const potion = player?.potions.find((item) => item.state === "empty" && !item.removed);
  if (potion) potion.state = "full";
}

function applyTowerMoveInPlace(game, towerId, steps) {
  const tower = game.towers.find((item) => item.id === towerId);
  if (!tower || tower.kind === "keep") return "Chỉ có thể di chuyển tháp thường.";
  const source = tower.tileIndex;
  const sourceStack = towerStack(game, source);
  const selectedLevel = sourceStack.findIndex((item) => item.id === towerId);
  if (selectedLevel < 0) return "Không tìm thấy tầng tháp đã chọn.";
  const movingStack = sourceStack.slice(selectedLevel);
  const movingIds = new Set(movingStack.map((item) => item.id));
  const signedSteps = steps;
  const destination = wrapBoardIndex(source + steps, game.board.length);
  const keep = game.towers.find((item) => item.kind === "keep");
  const carriesKeep = movingIds.has(keep.id);
  if (!carriesKeep && destination === keep.tileIndex) return "Tháp không thể kết thúc ở Tháp Đen.";

  const carriedFree = game.wizards.filter((wizard) => (
    wizard.tileIndex === source && !wizard.safe && !wizard.capturedBy &&
    wizard.standingOn && movingIds.has(wizard.standingOn)
  ));
  const carriedFreeIds = new Set(carriedFree.map((wizard) => wizard.id));
  const coveredPrisoners = game.wizards.filter((wizard) => wizard.capturedBy && movingIds.has(wizard.capturedBy));
  const carriedPrisoners = coveredPrisoners.filter((wizard) => isPrisonerCarriedByMovingStack(sourceStack, movingIds, wizard));
  const releasedPrisoners = coveredPrisoners.filter((wizard) => !carriedPrisoners.some((p) => p.id === wizard.id));

  game.towers.filter((item) => movingIds.has(item.id)).forEach((item) => { item.tileIndex = destination; });
  recordLastMoves(game, movingStack.map((item) => moveRecord("tower", item.id, source, destination, signedSteps)));
  const sourceRemaining = towerStack(game, source).filter((item) => !movingIds.has(item.id));
  setStackLevels(game, source, sourceRemaining.map((item) => item.id));
  const destinationBase = towerStack(game, destination).filter((item) => !movingIds.has(item.id));
  setStackLevels(game, destination, [...destinationBase.map((item) => item.id), ...movingStack.map((item) => item.id)]);

  releasedPrisoners.forEach((wizard) => {
    wizard.capturedBy = null;
    wizard.tileIndex = source;
    wizard.standingOn = topTower(game, source)?.id ?? null;
  });
  carriedPrisoners.forEach((wizard) => { wizard.tileIndex = destination; });
  const captured = game.wizards.filter((wizard) => (
    wizard.tileIndex === destination && !wizard.safe && !wizard.capturedBy && !carriedFreeIds.has(wizard.id)
  ));
  captured.forEach((wizard) => { wizard.capturedBy = towerId; });
  carriedFree.forEach((wizard) => { wizard.tileIndex = destination; });
  if (captured.length) fillPotion(game, game.turnOrder[game.currentPlayerIndex]);

  return null;
}

export function useForbidden(game, spellId, { free = false, targetId = null, targetId2 = null, valueOverride = null } = {}) {
  const spell = game.forbidden.find((item) => item.id === spellId);
  const player = currentPlayer(game);
  if (!spell || !player) return game;
  const safeBefore = new Set(game.wizards.filter((w) => w.safe).map((w) => w.id));
  const full = player.potions.filter((p) => p.state === "full" && !p.removed);
  if (!free && full.length < spell.potionCost) return withMessage(game, "Chưa đủ bình thuốc đầy để dùng Bí thuật.");
  if (spell.targeting && spell.targeting !== "auto" && targetId == null) return withMessage(game, "Cần chọn mục tiêu.");
  const next = cloneGame(game);
  normalizeExpansionPotions(next);
  const nextPlayer = currentPlayer(next);
  if (!free) nextPlayer.potions.filter((p) => p.state === "full" && !p.removed).slice(0, spell.potionCost).forEach((p) => {
    if (next.expansionMode) {
      p.state = "empty";
      p.removed = false;
    }
    else p.removed = true;
  });
  const keep = next.towers.find((t) => t.kind === "keep");
  let effectMsg = spell.effect;
  let refreshForbiddenAfterUse = false;

  switch (spell.id) {
    case "borrowed-shadow": {
      const err = applyWizardMoveInPlace(next, targetId, 1);
      if (err) effectMsg = err;
      break;
    }
    case "backward-step": {
      const err = applyWizardMoveInPlace(next, targetId, -1);
      if (err) effectMsg = err;
      break;
    }
    case "midnight-step": {
      if (!winner(next)) moveKeepToNearestRavenLanding(next, keep.tileIndex);
      break;
    }
    case "keep-clockwise-step": {
      const source = keep.tileIndex;
      const destination = (keep.tileIndex + 1) % next.board.length;
      if (hasAnyWizardAtTile(next, destination)) { effectMsg = "Ô/tháp kế tiếp không available."; break; }
      keep.tileIndex = destination;
      keep.level = next.towers.filter((tower) => tower.id !== keep.id && tower.tileIndex === destination).length;
      recordLastMoves(next, [moveRecord("tower", keep.id, source, destination, 1)]);
      normalizeTowerLevels(next);
      break;
    }
    case "sealed-stair": {
      const targetTower = next.towers.find((t) => t.id === targetId);
      const tileIdx = targetTower?.tileIndex;
      if (tileIdx == null) { effectMsg = "Không tìm thấy ô được chọn."; break; }
      const imprisonedOwn = next.wizards.filter((w) => w.capturedBy && w.playerId === nextPlayer.id && next.towers.find((t) => t.id === w.capturedBy && t.tileIndex === tileIdx));
      const imprisonedOpp = next.wizards.filter((w) => w.capturedBy && w.playerId !== nextPlayer.id && next.towers.find((t) => t.id === w.capturedBy && t.tileIndex === tileIdx));
      const pool = imprisonedOwn.length > 0 ? imprisonedOwn : imprisonedOpp.length > 0 ? imprisonedOpp : [];
      if (pool.length === 0) { effectMsg = "Không có pháp sư bị giam tại đây."; break; }
      if (tileOccupants(next, tileIdx).length >= MAX_WIZARDS_PER_LOCATION) { effectMsg = "Ô/tháp đích đã có đủ 4 pháp sư."; break; }
      const toFree = pool[Math.floor(Math.random() * pool.length)];
      const topStackTower = topTower(next, tileIdx);
      toFree.capturedBy = null;
      toFree.tileIndex = tileIdx;
      toFree.standingOn = topStackTower?.id ?? null;
      moveWizardToRenderTop(next, toFree.id);
      effectMsg = `Giải phóng ${toFree.name} từ ô được chọn lên đỉnh stack.`;
      break;
    }
    case "top-tower-swap": {
      const towerA = next.towers.find((t) => t.id === targetId);
      const towerB = next.towers.find((t) => t.id === targetId2);
      if (!towerA || !towerB) { effectMsg = "Không thể đổi tháp."; break; }
      const tileA = towerA.tileIndex;
      const tileB = towerB.tileIndex;
      if (tileA === tileB) { effectMsg = "Cần chọn 2 ô khác nhau."; break; }
      if (topTower(next, tileA)?.id !== towerA.id || topTower(next, tileB)?.id !== towerB.id) { effectMsg = "Chỉ có thể đổi tháp trên cùng."; break; }

      const keepTower = towerA.kind === "keep" ? towerA : towerB.kind === "keep" ? towerB : null;
      if (keepTower) {
        const keepTile = keepTower.tileIndex;
        const otherTile = keepTower === towerA ? tileB : tileA;
        const topOtherTower = keepTower === towerA ? towerB : towerA;
        if (!next.towers.some((t) => t.kind === "tower" && t.tileIndex === keepTile)) { effectMsg = "Tháp Đen cần đứng trên tháp thường để hoán đổi."; break; }

        const fullKeepStack = towerStack(next, keepTile);
        const keepGroup = fullKeepStack.slice(-2); // [tower directly below Ravenskeep, Ravenskeep]
        const keepGroupIds = new Set(keepGroup.map((t) => t.id));
        const keepTileRemaining = fullKeepStack.slice(0, -2);
        const otherRemaining = towerStack(next, otherTile).filter((t) => t.id !== topOtherTower.id);
        const baseLevel = otherRemaining.length;

        topOtherTower.tileIndex = keepTile;
        topOtherTower.level = keepTileRemaining.length;
        keepGroup.forEach((t, i) => { t.tileIndex = otherTile; t.level = baseLevel + i; });

        next.wizards.filter((w) => !w.safe && !w.capturedBy && w.tileIndex === keepTile && keepGroupIds.has(w.standingOn))
          .forEach((w) => { w.tileIndex = otherTile; });
        next.wizards.filter((w) => w.capturedBy && keepGroupIds.has(w.capturedBy))
          .forEach((w) => { w.tileIndex = otherTile; });
        next.wizards.filter((w) => !w.safe && !w.capturedBy && w.standingOn === topOtherTower.id)
          .forEach((w) => { w.tileIndex = keepTile; });
        next.wizards.filter((w) => w.capturedBy === topOtherTower.id)
          .forEach((w) => { w.tileIndex = keepTile; });

        effectMsg = `Ravenskeep và các tháp dưới bay sang, ${topOtherTower.name} về đây.`;
      } else {
        const levelA = towerA.level;
        const levelB = towerB.level;
        const wizardsOnA = next.wizards.filter((w) => !w.safe && !w.capturedBy && w.standingOn === towerA.id);
        const wizardsOnB = next.wizards.filter((w) => !w.safe && !w.capturedBy && w.standingOn === towerB.id);
        const prisonersUnderA = next.wizards.filter((w) => w.capturedBy === towerA.id);
        const prisonersUnderB = next.wizards.filter((w) => w.capturedBy === towerB.id);

        towerA.tileIndex = tileB;
        towerA.level = levelB;
        towerB.tileIndex = tileA;
        towerB.level = levelA;
        wizardsOnA.forEach((w) => { w.tileIndex = tileB; });
        wizardsOnB.forEach((w) => { w.tileIndex = tileA; });
        prisonersUnderA.forEach((w) => { w.capturedBy = towerB.id; w.tileIndex = tileA; });
        prisonersUnderB.forEach((w) => { w.capturedBy = towerA.id; w.tileIndex = tileB; });
        effectMsg = `${towerA.name} và ${towerB.name} đổi vị trí.`;
      }
      break;
    }
    case "raven-tower-step": {
      const err = applyTowerMoveInPlace(next, targetId, 1);
      if (err) effectMsg = err;
      break;
    }
    case "forbidden-refresh": {
      refreshForbiddenAfterUse = true;
      effectMsg = "Rút Bí thuật mới thay thế.";
      break;
    }
    case "shadow-swap": {
      const ownWizard = next.wizards.find((w) => w.id === targetId && w.playerId === nextPlayer.id && !w.safe && !w.capturedBy && w.tileIndex != null);
      const opponentWizard = next.wizards.find((w) => w.id === targetId2 && w.playerId !== nextPlayer.id && !w.safe && !w.capturedBy && w.tileIndex != null);
      if (!ownWizard || !opponentWizard) { effectMsg = "Không thể thực hiện nước đi"; break; }
      if (mistBlocksKeepEntry(next, opponentWizard.tileIndex) || mistBlocksKeepEntry(next, ownWizard.tileIndex)) {
        effectMsg = mistBlockedMessage();
        break;
      }

      const ownTileIndex = ownWizard.tileIndex;
      const ownStandingOn = ownWizard.standingOn ?? null;
      ownWizard.tileIndex = opponentWizard.tileIndex;
      ownWizard.standingOn = opponentWizard.standingOn ?? null;
      opponentWizard.tileIndex = ownTileIndex;
      opponentWizard.standingOn = ownStandingOn;
      moveWizardToRenderTop(next, ownWizard.id);
      moveWizardToRenderTop(next, opponentWizard.id);
      effectMsg = `${ownWizard.name} và ${opponentWizard.name} đổi chỗ.`;
      break;
    }
    case "mist-veil": {
      next.mistVeil = { playerId: nextPlayer.id };
      effectMsg = "Sương mù bao phủ Tháp Đen đến lượt tiếp theo của bạn.";
      break;
    }
    case "puppet-strings": {
      const steps = Number(valueOverride);
      if (!Number.isFinite(steps)) { effectMsg = "Cần tung xúc xắc trước khi điều khiển pháp sư."; break; }
      const targetWizard = next.wizards.find((w) => w.id === targetId && w.playerId !== nextPlayer.id && !w.safe && !w.capturedBy && w.tileIndex != null);
      if (!targetWizard) { effectMsg = "Không thể thực hiện nước đi"; break; }
      if (steps === 0) { effectMsg = `${targetWizard.name} không di chuyển.`; break; }
      const err = applyWizardMoveInPlace(next, targetId, steps);
      if (err) effectMsg = err;
      else effectMsg = `Điều khiển ${targetWizard.name} đi ${steps} bước.`;
      break;
    }
    default: break;
  }

  next.forbiddenDiscard ??= [];
  const discardedAfterUse = refreshForbiddenAfterUse ? next.forbidden : next.forbidden.filter((s) => s.id === spell.id);
  next.forbidden = refreshForbiddenAfterUse ? [] : next.forbidden.filter((s) => s.id !== spell.id);
  next.forbiddenDiscard.push(...discardedAfterUse);
  drawForbiddenToRow(next);
  next.message = `${nextPlayer.name} dùng "${spell.name}". ${effectMsg}`;
  next.log.unshift(next.message);
  const newlySafe = next.wizards.some((w) => w.safe && !safeBefore.has(w.id));
  if (newlySafe) {
    next.actionsRemaining = 0;
    return endTurn(next);
  }
  return next;
}

export function rerollForbidden(game, allSpells) {
  const next = cloneGame(game);
  const currentFirstId = next.forbidden[0]?.id;
  const currentIndex = Math.max(0, allSpells.findIndex((spell) => spell.id === currentFirstId));
  const startIndex = (currentIndex + 3) % allSpells.length;
  const rotated = allSpells.map((_, index) => allSpells[(startIndex + index) % allSpells.length]);
  next.forbidden = rotated.slice(0, 3);
  next.forbiddenPool = rotated.slice(3);
  next.forbiddenDiscard = [];
  next.message = "Debug: rút lại Bí thuật mới.";
  next.log.unshift(next.message);
  return next;
}

export function replaceSpellbooks(game) {
  const next = cloneGame(game);
  const player = currentPlayer(next);
  const removed = player.hand.length;
  next.deck.push(...shuffle(player.hand));
  player.hand = [];
  drawToHand(next, player, 3);
  next.actionsRemaining = 0;
  next.message = `${player.name} bỏ ${removed} Sách phép và rút 3 lá mới.`;
  next.log.unshift(next.message);
  return endTurn(next);
}

export function debugCreateTowerStack(game, stackSize, forcedTileIndex = null) {
  const next = cloneGame(game);
  const keep = next.towers.find((tower) => tower.kind === "keep");
  const maxNormalTowers = next.towers.filter((tower) => tower.kind === "tower").length;
  const totalSize = stackSize === "all"
    ? maxNormalTowers + (keep ? 1 : 0)
    : Math.max(1, Math.min(maxNormalTowers + (keep ? 1 : 0), Number(stackSize) || 1));
  const normalTowerCount = Math.max(0, totalSize - (keep ? 1 : 0));
  const eligibleTiles = next.board
    .map((tile, index) => index)
    .filter((tileIndex) => !hasAnyWizardAtTile(next, tileIndex));
  const requestedTileIndex = Number(forcedTileIndex);
  const tileIndex = Number.isInteger(requestedTileIndex) && requestedTileIndex >= 0 && requestedTileIndex < next.board.length
    ? requestedTileIndex
    : shuffle(eligibleTiles)[0] ?? 0;
  const towers = [
    ...shuffle(next.towers.filter((tower) => tower.kind === "tower")).slice(0, normalTowerCount),
    ...(keep ? [keep] : [])
  ];

  towers.forEach((tower, level) => {
    tower.tileIndex = tileIndex;
    tower.level = level;
  });
  normalizeTowerLevels(next);
  next.message = `Debug: tạo stack ${towers.length} tháp tại ô ${tileIndex}.`;
  next.log.unshift(next.message);
  return next;
}

export function debugCreateOverlapTowerPair(game, frontTileIndex, backTileIndex) {
  const next = cloneGame(game);
  const towerTiles = [Number(frontTileIndex), Number(backTileIndex)]
    .filter((tileIndex) => Number.isInteger(tileIndex) && tileIndex >= 0 && tileIndex < next.board.length);
  if (towerTiles.length < 2) return next;

  const keep = next.towers.find((tower) => tower.kind === "keep");
  const normalTowers = next.towers.filter((tower) => tower.kind === "tower");
  const frontTowers = [
    ...normalTowers.slice(0, 7),
    ...(keep ? [keep] : [])
  ].slice(0, 8);
  let backTower = normalTowers.find((tower) => !frontTowers.some((item) => item.id === tower.id));
  if (!backTower) {
    backTower = {
      id: "debug-overlap-tower",
      name: "Debug Tháp",
      kind: "tower",
      hasRaven: false,
      tileIndex: towerTiles[1],
      level: 0
    };
    next.towers = next.towers.filter((tower) => tower.id !== backTower.id);
    next.towers.push(backTower);
  }

  frontTowers.forEach((tower, level) => {
    tower.tileIndex = towerTiles[0];
    tower.level = level;
  });
  backTower.tileIndex = towerTiles[1];
  backTower.level = 0;

  normalizeTowerLevels(next);
  next.message = `Debug: tạo cặp stack test T${towerTiles[0]} có 8 tháp, T${towerTiles[1]} có 1 tháp.`;
  next.log.unshift(next.message);
  return next;
}

export function playSpell(game, spellId, action) {
  const player = currentPlayer(game);
  const spell = player.hand.find((item) => item.id === spellId);
  if (!spell) return withMessage(game, "Không tìm thấy sách phép.");
  const page = spell.pages.find((item) => item.type === action.type);
  if (!page) return withMessage(game, "Sách phép này không có hành động đã chọn.");
  const spellValue = action.valueOverride ?? page.value;
  const attempted = action.type === "wizard"
    ? moveWizard(game, action.targetId, spellValue)
    : moveTower(game, action.targetId, spellValue);
  if (attempted.actionRejected) {
    return withMessage(game, "Không thể thực hiện nước đi");
  }
  const afterReturn = returnSpellToPool(game, spellId);
  return action.type === "wizard"
    ? moveWizard(afterReturn, action.targetId, spellValue)
    : moveTower(afterReturn, action.targetId, spellValue);
}

export function resolveZeroStepSpell(game, spellId, type) {
  const player = currentPlayer(game);
  const spell = player?.hand.find((item) => item.id === spellId);
  if (!spell) return withMessage(game, "Không tìm thấy sách phép.");
  const subject = type === "tower" ? "Tháp" : "Pháp sư";
  const afterReturn = returnSpellToPool(game, spellId);
  const next = finishAction(afterReturn);
  next.message = `${subject} không di chuyển.`;
  next.log.unshift(next.message);
  return next;
}

export function resolveFailedSpellAction(game, spellId, message = "Không thể thực hiện nước đi") {
  const player = currentPlayer(game);
  const spell = player?.hand.find((item) => item.id === spellId);
  if (!spell) return withMessage(game, "Không tìm thấy sách phép.");
  const afterReturn = returnSpellToPool(game, spellId);
  const next = finishAction(afterReturn);
  next.message = message;
  next.log.unshift(next.message);
  return next;
}

export function botPlayStep(game) {
  const player = currentPlayer(game);
  if (!player) return game;
  const options = [];
  options.push(...botForbiddenOptions(game, player));

  for (const spell of player.hand) {
    for (const page of spell.pages) {
      const targets = legalTargets(game, player.id, page.type);
      for (const target of targets) {
        const action = { type: page.type, targetId: target.id };
        const next = playSpell(game, spell.id, action);
        const movedTurn = next.currentPlayerIndex !== game.currentPlayerIndex || next.actionsRemaining < game.actionsRemaining;
        if (movedTurn) {
          options.push({
            spell,
            page,
            target,
            action,
            score: scoreBotAction(game, next, player.id, page, target)
          });
        }
      }
    }
  }

  const best = options.sort((a, b) => b.score - a.score)[0];
  if (best && best.score > -500) {
    const next = best.kind === "forbidden"
      ? useForbidden(game, best.spell.id, { targetId: best.target.id, valueOverride: best.action?.valueOverride })
      : playSpell(game, best.spell.id, best.action);
    next.lastBotAction = buildBotActionVisual(player.id, best);
    next.log.unshift(`${player.name} bot chọn ${best.spell.name} cho ${best.target.name} (${best.score} điểm).`);
    return next;
  }

  const refreshed = replaceSpellbooks(game);
  delete refreshed.lastBotAction;
  refreshed.log.unshift(`${player.name} bot không có Sách phép hợp lệ nên refresh bài.`);
  return refreshed;
}

function buildBotActionVisual(playerId, best) {
  if (best.kind === "forbidden") {
    return {
      playerId,
      action: { kind: "forbidden", spell: best.spell }
    };
  }

  return {
    playerId,
    action: {
      kind: "spell",
      spell: best.spell,
      pageType: best.page?.type
    }
  };
}

function botForbiddenOptions(game, player) {
  const options = [];
  const fullPotions = player.potions.filter((potion) => potion.state === "full" && !potion.removed).length;
  const canAfford = (spell) => fullPotions >= (spell.potionCost ?? 1);

  for (const spell of game.forbidden) {
    if (!canAfford(spell)) continue;

    if (spell.id === "sealed-stair") {
      options.push(...botForbiddenRescueOptions(game, player, spell));
      continue;
    }

    if (spell.id === "borrowed-shadow" || spell.id === "backward-step") {
      const ownWizards = game.wizards.filter((wizard) => wizard.playerId === player.id && !wizard.safe && !wizard.capturedBy && wizard.tileIndex != null);
      ownWizards.forEach((wizard) => {
        const next = useForbidden(game, spell.id, { targetId: wizard.id });
        options.push({
          kind: "forbidden",
          spell,
          target: wizard,
          score: scoreBotForbiddenEffect(game, next, player.id, spell) + (game.expansionMode ? 260 : 0)
        });
      });
      continue;
    }

    if (spell.id === "puppet-strings") {
      const opponentWizards = game.wizards.filter((wizard) => wizard.playerId !== player.id && !wizard.safe && !wizard.capturedBy && wizard.tileIndex != null);
      opponentWizards.forEach((wizard) => {
        [-2, -1, 1, 2, 3].forEach((value) => {
          const next = useForbidden(game, spell.id, { targetId: wizard.id, valueOverride: value });
          options.push({
            kind: "forbidden",
            spell,
            target: wizard,
            action: { valueOverride: value },
            score: scoreBotForbiddenEffect(game, next, player.id, spell) + (game.expansionMode ? 420 : 0)
          });
        });
      });
      continue;
    }

    if (spell.targeting === "auto" && (spell.id === "midnight-step" || spell.id === "keep-clockwise-step" || spell.id === "mist-veil" || spell.id === "forbidden-refresh")) {
      const next = useForbidden(game, spell.id);
      options.push({
        kind: "forbidden",
        spell,
        target: { id: spell.id, name: spell.name },
        score: scoreBotForbiddenEffect(game, next, player.id, spell) + (game.expansionMode ? 320 : 0)
      });
    }
  }

  return options.filter((option) => option.score > -Infinity);
}

function botForbiddenRescueOptions(game, player, spell) {
  const fullPotions = player.potions.filter((potion) => potion.state === "full" && !potion.removed).length;
  if (fullPotions < spell.potionCost) return [];

  const capturedTowerIds = new Set(game.wizards
    .filter((wizard) => wizard.playerId === player.id && wizard.capturedBy)
    .map((wizard) => wizard.capturedBy));
  if (!capturedTowerIds.size) return [];

  return game.towers
    .filter((tower) => tower.kind === "tower" && capturedTowerIds.has(tower.id))
    .map((tower) => {
      const next = useForbidden(game, spell.id, { targetId: tower.id });
      return {
        kind: "forbidden",
        spell,
        target: tower,
        score: scoreBotForbiddenRescue(game, next, player.id, tower) + (game.expansionMode ? 350 : 0)
      };
    })
    .filter((option) => option.score > -Infinity);
}

function scoreBotForbiddenEffect(before, after, playerId, spell) {
  if (after === before || after.actionRejected) return -Infinity;
  let score = scoreBoardProgress(before, after, playerId);
  const fullPotionsBefore = before.players.find((player) => player.id === playerId)?.potions.filter((potion) => potion.state === "full" && !potion.removed).length ?? 0;
  const fullPotionsAfter = after.players.find((player) => player.id === playerId)?.potions.filter((potion) => potion.state === "full" && !potion.removed).length ?? 0;
  const spentPotions = Math.max(0, fullPotionsBefore - fullPotionsAfter);
  score -= spentPotions * (before.expansionMode ? 120 : 380);
  if (before.expansionMode) score += 260;
  if (spell.id === "forbidden-refresh") score += before.expansionMode ? 180 : -80;
  if (spell.id === "mist-veil") score += before.expansionMode ? 240 : 60;
  return score;
}

function scoreBoardProgress(before, after, playerId) {
  const keepBefore = before.towers.find((tower) => tower.kind === "keep");
  const boardSize = before.board.length;
  let score = 0;

  const ownSafeBefore = before.wizards.filter((wizard) => wizard.playerId === playerId && wizard.safe).length;
  const ownSafeAfter = after.wizards.filter((wizard) => wizard.playerId === playerId && wizard.safe).length;
  score += Math.max(0, ownSafeAfter - ownSafeBefore) * 9000;

  const opponentSafeBefore = before.wizards.filter((wizard) => wizard.playerId !== playerId && wizard.safe).length;
  const opponentSafeAfter = after.wizards.filter((wizard) => wizard.playerId !== playerId && wizard.safe).length;
  score -= Math.max(0, opponentSafeAfter - opponentSafeBefore) * 6200;

  before.wizards.filter((wizard) => wizard.playerId === playerId && !wizard.safe && !wizard.capturedBy && wizard.tileIndex != null).forEach((beforeWizard) => {
    const afterWizard = after.wizards.find((wizard) => wizard.id === beforeWizard.id);
    if (!afterWizard || afterWizard.safe || afterWizard.capturedBy || afterWizard.tileIndex == null || keepBefore?.tileIndex == null) return;
    const beforeDistance = distanceClockwise(beforeWizard.tileIndex, keepBefore.tileIndex, boardSize);
    const afterDistance = distanceClockwise(afterWizard.tileIndex, keepBefore.tileIndex, boardSize);
    score += (beforeDistance - afterDistance) * 170;
  });

  const opponentCapturedBefore = before.wizards.filter((wizard) => wizard.playerId !== playerId && wizard.capturedBy).length;
  const opponentCapturedAfter = after.wizards.filter((wizard) => wizard.playerId !== playerId && wizard.capturedBy).length;
  score += (opponentCapturedAfter - opponentCapturedBefore) * (before.expansionMode ? 1900 : 420);

  const ownCapturedBefore = before.wizards.filter((wizard) => wizard.playerId === playerId && wizard.capturedBy).length;
  const ownCapturedAfter = after.wizards.filter((wizard) => wizard.playerId === playerId && wizard.capturedBy).length;
  score -= Math.max(0, ownCapturedAfter - ownCapturedBefore) * 900;

  return score;
}

function scoreBotForbiddenRescue(before, after, playerId, tower) {
  const released = countReleasedWizards(before, after, playerId);
  if (!released) return -Infinity;
  const prisonersAtTower = before.wizards.filter((wizard) => wizard.playerId === playerId && wizard.capturedBy === tower.id).length;
  const expansionBonus = before.expansionMode ? 1800 : 0;
  return released * (9000 + expansionBonus) + prisonersAtTower * 900;
}

function countReleasedWizards(before, after, playerId) {
  return before.wizards.filter((wizard) => {
    if (wizard.playerId !== playerId || !wizard.capturedBy) return false;
    const nextWizard = after.wizards.find((item) => item.id === wizard.id);
    return nextWizard && !nextWizard.capturedBy && !nextWizard.safe;
  }).length;
}

function scoreBotAction(before, after, playerId, page, target) {
  const keepBefore = before.towers.find((tower) => tower.kind === "keep");
  const boardSize = before.board.length;
  const expansionMode = Boolean(before.expansionMode);
  let score = 0;

  if (page.type === "wizard") {
    const beforeWizard = before.wizards.find((wizard) => wizard.id === target.id);
    const afterWizard = after.wizards.find((wizard) => wizard.id === target.id);
    if (!beforeWizard || !afterWizard) return -Infinity;
    if (afterWizard.safe && !beforeWizard.safe) return 10000;

    if (afterWizard.tileIndex != null && keepBefore?.tileIndex != null) {
      const beforeDistance = distanceClockwise(beforeWizard.tileIndex, keepBefore.tileIndex, boardSize);
      const afterDistance = distanceClockwise(afterWizard.tileIndex, keepBefore.tileIndex, boardSize);
      score += (beforeDistance - afterDistance) * 120;
      score += Math.max(0, 12 - afterDistance) * 8;
    }

    if (topTower(after, afterWizard.tileIndex)?.kind === "tower") score += 20;
    return score;
  }

  const tower = before.towers.find((item) => item.id === target.id);
  if (!tower) return -Infinity;
  const sourceStack = towerStack(before, tower.tileIndex);
  const selectedLevel = sourceStack.findIndex((item) => item.id === tower.id);
  const movingStack = selectedLevel >= 0 ? sourceStack.slice(selectedLevel) : [];
  const movingIds = new Set(movingStack.map((item) => item.id));
  const keepMoved = movingIds.has(keepBefore?.id);
  const ownCapturedCarried = before.wizards.filter((wizard) => wizard.playerId === playerId && wizard.capturedBy && movingIds.has(wizard.capturedBy)).length;
  const ownReleased = countReleasedWizards(before, after, playerId);
  score += ownReleased * 7200;
  score += ownCapturedCarried * (keepMoved ? 4200 : 920);
  if (ownCapturedCarried) {
    score += keepMoved ? 1500 : 180;
    score += scoreRescuePosition(before, after, playerId, movingIds, keepBefore);
  }

  const ownSafeBefore = before.wizards.filter((wizard) => wizard.playerId === playerId && wizard.safe).length;
  const ownSafeAfter = after.wizards.filter((wizard) => wizard.playerId === playerId && wizard.safe).length;
  score += Math.max(0, ownSafeAfter - ownSafeBefore) * 6500;

  const opponentSafeBefore = before.wizards.filter((wizard) => wizard.playerId !== playerId && wizard.safe).length;
  const opponentSafeAfter = after.wizards.filter((wizard) => wizard.playerId !== playerId && wizard.safe).length;
  score -= Math.max(0, opponentSafeAfter - opponentSafeBefore) * 5200;

  const opponentCapturedBefore = before.wizards.filter((wizard) => wizard.playerId !== playerId && wizard.capturedBy).length;
  const opponentCapturedAfter = after.wizards.filter((wizard) => wizard.playerId !== playerId && wizard.capturedBy).length;
  const opponentCapturedDelta = opponentCapturedAfter - opponentCapturedBefore;
  score += opponentCapturedDelta * (expansionMode ? 2400 : 520);

  const ownCapturedBefore = before.wizards.filter((wizard) => wizard.playerId === playerId && wizard.capturedBy).length;
  const ownCapturedAfter = after.wizards.filter((wizard) => wizard.playerId === playerId && wizard.capturedBy).length;
  score -= Math.max(0, ownCapturedAfter - ownCapturedBefore) * 700;

  const fullPotionsBefore = currentPlayer(before)?.potions.filter((potion) => potion.state === "full" && !potion.removed).length ?? 0;
  const fullPotionsAfter = after.players.find((player) => player.id === playerId)?.potions.filter((potion) => potion.state === "full" && !potion.removed).length ?? 0;
  const fullPotionGain = Math.max(0, fullPotionsAfter - fullPotionsBefore);
  score += fullPotionGain * (expansionMode ? 1800 : 180);
  if (expansionMode && fullPotionGain > 0) {
    const cheapestForbiddenCost = Math.min(...before.forbidden.map((spell) => spell.potionCost ?? 1));
    if (fullPotionsAfter >= cheapestForbiddenCost) score += 900;
  }

  const movedTowerAfter = after.towers.find((item) => item.id === tower.id);
  if (movedTowerAfter && keepBefore?.tileIndex != null) {
    const beforeDistance = distanceClockwise(tower.tileIndex, keepBefore.tileIndex, boardSize);
    const afterDistance = distanceClockwise(movedTowerAfter.tileIndex, keepBefore.tileIndex, boardSize);
    score += (beforeDistance - afterDistance) * 12;
  }

  if (tower.hasRaven) score += 20;
  return score;
}

function distanceClockwise(from, to, boardSize) {
  return (to - from + boardSize) % boardSize;
}

function scoreRescuePosition(before, after, playerId, movingIds, keepBefore) {
  const boardSize = before.board.length;
  const capturedTowerIds = new Set(before.wizards
    .filter((wizard) => wizard.playerId === playerId && wizard.capturedBy && movingIds.has(wizard.capturedBy))
    .map((wizard) => wizard.capturedBy));
  let score = 0;

  capturedTowerIds.forEach((towerId) => {
    const beforeTower = before.towers.find((tower) => tower.id === towerId);
    const afterTower = after.towers.find((tower) => tower.id === towerId);
    if (!beforeTower || !afterTower || keepBefore?.tileIndex == null) return;
    const beforeDistance = distanceClockwise(beforeTower.tileIndex, keepBefore.tileIndex, boardSize);
    const afterDistance = distanceClockwise(afterTower.tileIndex, keepBefore.tileIndex, boardSize);
    score += (beforeDistance - afterDistance) * 260;
    score += Math.max(0, boardSize - afterDistance) * 24;
  });

  return score;
}

function returnSpellToPool(game, spellId) {
  const next = cloneGame(game);
  const player = currentPlayer(next);
  const spell = player.hand.find((item) => item.id === spellId);
  if (!spell) return next;
  player.hand = player.hand.filter((item) => item.id !== spellId);
  next.deck.push(spell);
  return next;
}

function drawToHand(game, player, targetCount) {
  while (player.hand.length < targetCount && game.deck.length) player.hand.push(game.deck.shift());
}

function drawForbiddenToRow(game, targetCount = 3) {
  game.forbidden ??= [];
  game.forbiddenPool ??= [];
  game.forbiddenDiscard ??= [];
  while (game.forbidden.length < targetCount) {
    if (game.forbiddenPool.length === 0) {
      if (game.forbiddenDiscard.length === 0) break;
      game.forbiddenPool.push(...shuffle(game.forbiddenDiscard));
      game.forbiddenDiscard = [];
    }
    const nextSpell = game.forbiddenPool.shift();
    if (!nextSpell) break;
    game.forbidden.push(nextSpell);
  }
}

function finishAction(game, options = {}) {
  const next = cloneGame(game);
  normalizeExpansionPotions(next);
  delete next.actionRejected;
  next.actionsRemaining = Math.max(0, next.actionsRemaining - 1);
  if (options.forceEnd || next.actionsRemaining === 0) return endTurn(next);
  return next;
}

export function endTurn(game) {
  const next = cloneGame(game);
  normalizeExpansionPotions(next);
  delete next.actionRejected;
  next.towers.forEach((t) => { delete t.tempRaven; });
  next.players.forEach((p) => { delete p.bonusStep; });
  drawForbiddenToRow(next);
  const player = currentPlayer(next);
  drawToHand(next, player, 3);
  next.actionsRemaining = 2;
  next.currentPlayerIndex = (next.currentPlayerIndex + 1) % next.turnOrder.length;
  const mistExpired = next.mistVeil?.playerId === next.turnOrder[next.currentPlayerIndex];
  if (mistExpired) next.mistVeil = { ...next.mistVeil, expiring: true };
  next.message = `Đến lượt ${currentPlayer(next).name}.`;
  next.log.unshift(next.message);
  if (mistExpired) next.log.unshift("Sương Mù quanh Tháp Đen đã tan.");
  return next;
}

const DRAW_RESULT = { id: "draw", name: "Hòa" };

export function winner(game) {
  // Rule 1: all wizards safe + all potions full → thắng ngay
  const immediateWinner = game.players.find((p) => {
    const allSafe = game.wizards.filter((w) => w.playerId === p.id).every((w) => w.safe);
    const allFull = p.potions.every((pot) => pot.removed || pot.state === "full");
    return allSafe && allFull;
  });
  if (immediateWinner) return immediateWinner;

  // Rule 3: tất cả player đều có wizard safe → so sánh bình đầy
  const allDone = game.players.every((p) =>
    game.wizards.filter((w) => w.playerId === p.id).every((w) => w.safe)
  );
  if (!allDone) return null;

  const scores = game.players.map((p) => ({
    player: p,
    full: p.potions.filter((pot) => pot.state === "full" && !pot.removed).length
  }));
  const max = Math.max(...scores.map((s) => s.full));
  const leaders = scores.filter((s) => s.full === max);
  return leaders.length === 1 ? leaders[0].player : DRAW_RESULT;
}

function withMessage(game, message) {
  const next = cloneGame(game);
  next.message = message;
  next.log.unshift(message);
  next.actionRejected = true;
  return next;
}

function cloneGame(game) {
  return structuredClone(game);
}

function normalizeExpansionPotions(game) {
  if (!game?.expansionMode) return game;
  game.players?.forEach((player) => {
    player.potions?.forEach((potion) => {
      if (!potion.removed) return;
      potion.removed = false;
      potion.state = "empty";
    });
  });
  return game;
}
