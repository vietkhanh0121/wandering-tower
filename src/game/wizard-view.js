import { wizardStackSlot } from "./wizard-layout";

export function wizardDebugLabel(game, wizard) {
  const playerIndex = game.players.findIndex((player) => player.id === wizard.playerId);
  const prefix = game.players[playerIndex]?.name?.[0] ?? wizard.playerId.toUpperCase();
  const number = wizard.name.split("-").at(-1);
  return `${prefix}${number}`;
}

export function wizardLocationLabel(game, wizard) {
  if (wizard.safe) return "SAFE";
  const standing = wizard.standingOn
    ? ` ON ${game.towers.find((item) => item.id === wizard.standingOn)?.name ?? wizard.standingOn}`
    : " ON Ô";
  if (wizard.capturedBy) {
    const tower = game.towers.find((item) => item.id === wizard.capturedBy);
    const tileIndex = wizardVisualTileIndex(game, wizard);
    return `T${tileIndex}${standing} / COVER ${tower?.name ?? wizard.capturedBy}`;
  }
  return `T${wizard.tileIndex}${standing}`;
}

export function wizardVisualTileIndex(game, wizard) {
  if (wizard.capturedBy) return game.towers.find((tower) => tower.id === wizard.capturedBy)?.tileIndex ?? wizard.tileIndex ?? null;
  if (wizard.tileIndex != null) return wizard.tileIndex;
  return null;
}

export function assignWizardSlots(wizards) {
  return wizards.map((wizard, index) => ({ wizard, offset: wizardStackSlot(index, wizards.length) }));
}
