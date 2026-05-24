import { useEffect, useRef } from "react";
import {
  playForbiddenCard,
  playNewTurn,
  playPotionFilled,
  playWizardMove,
  playWizardSafe,
} from "../lib/sounds";

const HOP_MS = 220;
const PAUSE_MS = 45;
const WIZARD_PAUSE_MS = 90;
const TOWER_HOP_DELAY_MS = 120;

function wizardAnimMs(steps) {
  return steps * HOP_MS + Math.max(0, steps - 1) * WIZARD_PAUSE_MS;
}

function towerAnimMs(steps) {
  return TOWER_HOP_DELAY_MS + steps * HOP_MS + Math.max(0, steps - 1) * PAUSE_MS;
}

function recordedSteps(game, type, id, fromTileIndex, toTileIndex) {
  const move = Array.isArray(game?.lastMoves)
    ? game.lastMoves.find((item) => (
      item.type === type &&
      item.id === id &&
      item.fromTileIndex === fromTileIndex &&
      item.toTileIndex === toTileIndex
    ))
    : null;
  return move ? Math.abs(Number(move.steps) || 0) : null;
}

function shortestSteps(fromTileIndex, toTileIndex, boardSize) {
  const cw = (toTileIndex - fromTileIndex + boardSize) % boardSize;
  const ccw = (fromTileIndex - toTileIndex + boardSize) % boardSize;
  return Math.min(cw, ccw);
}

export function useSoundEffects(game) {
  const prevRef = useRef(null);
  const timersRef = useRef([]);

  useEffect(() => {
    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];

    if (!game) { prevRef.current = null; return; }
    const prev = prevRef.current;
    prevRef.current = game;
    if (!prev) return;

    const boardSize = game.board.length;
    const delay = (fn, ms) => {
      timersRef.current.push(window.setTimeout(fn, Math.max(0, ms)));
    };

    // Wizard events
    game.wizards.forEach((wizard) => {
      const prevW = prev.wizards.find((w) => w.id === wizard.id);
      if (!prevW) return;
      if (!prevW.safe && wizard.safe && prevW.tileIndex != null) {
        const keep = prev.towers.find((t) => t.kind === "keep");
        const steps = keep
          ? recordedSteps(game, "wizard", wizard.id, prevW.tileIndex, keep.tileIndex) ?? shortestSteps(prevW.tileIndex, keep.tileIndex, boardSize)
          : 1;
        delay(playWizardSafe, wizardAnimMs(Math.max(1, steps)));
      } else if (wizard.tileIndex != null && prevW.tileIndex != null && prevW.tileIndex !== wizard.tileIndex) {
        const steps = recordedSteps(game, "wizard", wizard.id, prevW.tileIndex, wizard.tileIndex) ?? shortestSteps(prevW.tileIndex, wizard.tileIndex, boardSize);
        delay(playWizardMove, wizardAnimMs(steps));
      }
    });

    // Potion filled — delayed to match tower capture animation
    const potionFilled = game.players.some((player) => {
      const prevP = prev.players.find((p) => p.id === player.id);
      return player.potions.some((potion) => {
        const prevPotion = prevP?.potions.find((p) => p.id === potion.id);
        return prevPotion?.state !== "full" && potion.state === "full" && !potion.removed;
      });
    });
    if (potionFilled) {
      // Find capturing tower steps for accurate delay
      let captureSteps = 1;
      game.wizards.forEach((w) => {
        const prevW = prev.wizards.find((p) => p.id === w.id);
        if (!prevW?.capturedBy && w.capturedBy) {
          const tower = game.towers.find((t) => t.id === w.capturedBy);
          const prevTower = prev.towers.find((t) => t.id === w.capturedBy);
          if (tower && prevTower && prevTower.tileIndex !== tower.tileIndex) {
            const steps = recordedSteps(game, "tower", tower.id, prevTower.tileIndex, tower.tileIndex) ?? shortestSteps(prevTower.tileIndex, tower.tileIndex, boardSize);
            captureSteps = Math.max(captureSteps, steps);
          }
        }
      });
      delay(playPotionFilled, towerAnimMs(captureSteps));
    }

    // Forbidden card used
    if (game.forbidden.length < prev.forbidden.length) playForbiddenCard();

    // New turn
    if (game.currentPlayerIndex !== prev.currentPlayerIndex) playNewTurn();

    return () => {
      timersRef.current.forEach(window.clearTimeout);
      timersRef.current = [];
    };
  }, [game]);
}
