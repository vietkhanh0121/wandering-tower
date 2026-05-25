import { useLayoutEffect, useRef, useState } from "react";
import { towerTileLevelPoint } from "../game/tower-layout";
import { wizardStackSlot } from "../game/wizard-layout";

const HOP_MS = 220;
const PAUSE_MS = 45;
const WIZARD_PAUSE_MS = 90;
const TOWER_HOP_DELAY_MS = 120;
const RAVENSKEEP_AFTER_WIZARD_DELAY_MS = 220;
const RAVENSKEEP_FLIGHT_PX_PER_MS = 0.42;
const RAVENSKEEP_FLIGHT_CLEARANCE_LEVELS = 2.5;
const RELEASE_JUMP_MS = 560;
const RELEASE_SPARKLE_LEAD_MS = 220;
const TOWER_SWAP_ARC_MS = 620;

export function usePieceHopAnimation(game, layoutOptions, { onSafe, onRelease } = {}) {
  const [towerJumpPaths, setTowerJumpPaths] = useState([]);
  const [hiddenShadowTileIndexes, setHiddenShadowTileIndexes] = useState(() => new Set());
  const [lingeringCapturedWizardIds, setLingeringCapturedWizardIds] = useState(() => new Set());
  const [lingeringSafeWizards, setLingeringSafeWizards] = useState(() => new Map());
  const [isAnimatingPieces, setIsAnimatingPieces] = useState(false);
  const prevRectsRef = useRef(new Map());
  const prevGameRef = useRef(null);
  const animationLayerCountsRef = useRef(new Map());
  const lingeringCaptureTimeoutRef = useRef(null);
  const lingeringSafeTimeoutRef = useRef(null);
  const releaseSparkleTimeoutRef = useRef(null);

  function captureState(snapshotGame = game) {
    prevGameRef.current = snapshotGame;
    setTowerJumpPaths([]);
    setHiddenShadowTileIndexes(new Set());
    setLingeringCapturedWizardIds(new Set());
    setLingeringSafeWizards(new Map());
    window.clearTimeout(lingeringCaptureTimeoutRef.current);
    window.clearTimeout(lingeringSafeTimeoutRef.current);
    window.clearTimeout(releaseSparkleTimeoutRef.current);
    setIsAnimatingPieces(true);
    document.documentElement.classList.add("tower-hop-pending");
    const map = new Map();
    document.querySelectorAll("[data-flip-id]").forEach((el) => {
      map.set(el.dataset.flipId, el.getBoundingClientRect());
    });
    prevRectsRef.current = map;
  }

  useLayoutEffect(() => {
    const prevRects = prevRectsRef.current;
    const prevGame = prevGameRef.current;
    if (!prevRects.size) {
      document.documentElement.classList.remove("tower-hop-pending");
      setIsAnimatingPieces(false);
      return;
    }
    prevRectsRef.current = new Map();
    prevGameRef.current = null;

    const nextHiddenShadowTileIndexes = new Set();
    if (prevGame && game) {
      game.board.forEach((_, tileIndex) => {
        const hadShadow = prevGame.towers.some((tower) => tower.tileIndex === tileIndex);
        const hasShadow = game.towers.some((tower) => tower.tileIndex === tileIndex);
        if (!hadShadow && hasShadow) nextHiddenShadowTileIndexes.add(tileIndex);
      });
      // For top-tower-swap: both tiles always had and still have towers, so the
      // "newly gained" check above misses them. Find swapped pairs and hide both tiles.
      game.towers.forEach((curTower) => {
        if (curTower.kind === "keep" || curTower.tileIndex == null) return;
        const prevTower = prevGame.towers.find((t) => t.id === curTower.id);
        if (!prevTower || prevTower.tileIndex == null || prevTower.tileIndex === curTower.tileIndex) return;
        const hasSwapPartner = game.towers.some((other) => {
          if (other.id === curTower.id || other.kind === "keep" || other.tileIndex == null) return false;
          const otherPrev = prevGame.towers.find((t) => t.id === other.id);
          return otherPrev?.tileIndex === curTower.tileIndex && other.tileIndex === prevTower.tileIndex;
        });
        if (hasSwapPartner) {
          nextHiddenShadowTileIndexes.add(prevTower.tileIndex);
          nextHiddenShadowTileIndexes.add(curTower.tileIndex);
        }
      });
    }
    setHiddenShadowTileIndexes(nextHiddenShadowTileIndexes);
    const newlyCapturedWizardIds = getNewlyCapturedWizardPlacements({ game, prevGame });
    const newlyReleasedWizardIds = getNewlyReleasedWizardIds({ game, prevGame });
    if (newlyReleasedWizardIds.size > 0) {
      window.clearTimeout(releaseSparkleTimeoutRef.current);
      releaseSparkleTimeoutRef.current = window.setTimeout(() => {
        onRelease?.([...newlyReleasedWizardIds]);
      }, Math.max(0, RELEASE_JUMP_MS - RELEASE_SPARKLE_LEAD_MS));
    }
    if (newlyCapturedWizardIds.size > 0) {
      setLingeringCapturedWizardIds(newlyCapturedWizardIds);
      const lingerMs = getCapturedWizardLingerMs({ game, prevGame, wizardIds: new Set(newlyCapturedWizardIds.keys()) });
      window.clearTimeout(lingeringCaptureTimeoutRef.current);
      lingeringCaptureTimeoutRef.current = window.setTimeout(() => {
        setLingeringCapturedWizardIds(new Set());
      }, lingerMs);
    }
    const newlySafeWizards = getNewlySafeWizards({ game, prevGame });
    if (newlySafeWizards.size > 0) {
      setLingeringSafeWizards(newlySafeWizards);
      const lingerMs = getSafeWizardLingerMs({ game, prevGame, safeWizards: newlySafeWizards });
      window.clearTimeout(lingeringSafeTimeoutRef.current);
      lingeringSafeTimeoutRef.current = window.setTimeout(() => {
        setLingeringSafeWizards(new Map());
      }, lingerMs);
      const jumpMs = getSafeWizardJumpMs({ game, prevGame, safeWizards: newlySafeWizards });
      const safeEntries = [...newlySafeWizards.entries()];
      window.setTimeout(() => onSafe?.(safeEntries), jumpMs);
    }

    let didStartAnimationSetup = false;
    const animationFrame = window.requestAnimationFrame(() => {
      didStartAnimationSetup = true;
      const boardSize = game?.board.length ?? 12;
      let runningAnimations = 0;
      const activeJumpPaths = [];

      const tileCenters = new Map();
      document.querySelectorAll("[data-tile-index]").forEach((el) => {
        const rect = el.getBoundingClientRect();
        tileCenters.set(Number(el.dataset.tileIndex), { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      });
      const wizardAnchors = new Map();
      document.querySelectorAll("[data-piece-tile-index]").forEach((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const anchorY = Number.parseFloat(style.getPropertyValue("--wizard-anchor-y")) || 0;
        wizardAnchors.set(Number(el.dataset.pieceTileIndex), {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2 + anchorY
        });
      });

      document.querySelectorAll("[data-flip-id]").forEach((el) => {
        const id = el.dataset.flipId;
        const isKeep = el.classList.contains("keepToken");
        const isTower = el.classList.contains("towerToken");
        const isTowerLike = isTower || isKeep;
        const before = prevRects.get(id);
        if (!before) {
          if (!isTowerLike && newlyReleasedWizardIds.has(id)) {
            const parentEl = el.closest(".wizardRow");
            const tileLayerEl = el.closest(".tilePieces");
            const raisedEls = [parentEl, tileLayerEl, el].filter(Boolean);
            raisedEls.forEach((item) => {
              const current = animationLayerCountsRef.current.get(item) ?? { count: 0, zIndex: item.style.zIndex };
              animationLayerCountsRef.current.set(item, { ...current, count: current.count + 1, elevatedZIndex: 31000 });
              item.style.zIndex = "31000";
            });
            el.classList.add("jumping");
            const anim = el.animate([
              { transform: "translate(0, 0) scale(0.96)", opacity: 0.75, offset: 0 },
              { transform: "translate(0, -30px) scale(1.05)", opacity: 1, offset: 0.48 },
              { transform: "translate(0, 0) scale(1)", opacity: 1, offset: 1 }
            ], {
              duration: RELEASE_JUMP_MS,
              easing: "cubic-bezier(.2, .75, .2, 1)",
              fill: "both"
            });
            runningAnimations += 1;

            let didCleanup = false;
            const cleanup = () => {
              if (didCleanup) return;
              didCleanup = true;
              raisedEls.forEach((item) => {
                const current = animationLayerCountsRef.current.get(item) ?? { count: 1, zIndex: "" };
                const nextCount = Math.max(0, current.count - 1);
                if (nextCount === 0) {
                  animationLayerCountsRef.current.delete(item);
                  item.style.zIndex = current.zIndex;
                  return;
                }
                animationLayerCountsRef.current.set(item, { ...current, count: nextCount });
              });
              el.classList.remove("jumping");
              runningAnimations -= 1;
              if (runningAnimations <= 0) {
                document.documentElement.classList.remove("tower-hop-pending");
                setHiddenShadowTileIndexes(new Set());
                setIsAnimatingPieces(false);
              }
            };
            anim.addEventListener("finish", cleanup, { once: true });
            anim.addEventListener("cancel", cleanup, { once: true });
          }
          return;
        }
        if (!didPieceStateChange({ id, game, prevGame, isTowerLike })) return;
        const after = el.getBoundingClientRect();
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

        const carriedTower = isTowerLike ? null : getCarriedTower({ id, game, prevGame });
        const followsTower = isTowerLike || carriedTower != null;
        const parentEl = el.closest(".towerStack") ?? el.closest(".wizardRow");
        const tileLayerEl = el.closest(".tilePieces");
        const destinationWizardRow = isTowerLike ? tileLayerEl?.querySelector(".wizardRow") : null;
        const raisedEls = [...new Set([
          parentEl,
          tileLayerEl,
          destinationWizardRow,
          isTowerLike && !isKeep ? null : el
        ].filter(Boolean))];
        const raisedZIndex = isKeep ? 42000 : isTowerLike ? 33000 : carriedTower ? 33500 : 31000;
        raisedEls.forEach((item) => {
          const current = animationLayerCountsRef.current.get(item) ?? { count: 0, zIndex: item.style.zIndex };
          const elevatedZIndex = Math.max(current.elevatedZIndex ?? 0, raisedZIndex);
          animationLayerCountsRef.current.set(item, { ...current, count: current.count + 1, elevatedZIndex });
          item.style.zIndex = String(elevatedZIndex);
          if (isTowerLike && item === parentEl) item.classList.add("hopping");
        });
        if (!isTowerLike) {
          el.classList.add("jumping");
          el.classList.toggle("flipX", before.left + before.width / 2 > after.left + after.width / 2);
        }

        let didCleanup = false;
        const cleanup = () => {
          if (didCleanup) return;
          didCleanup = true;
          raisedEls.forEach((item) => {
            const current = animationLayerCountsRef.current.get(item) ?? { count: 1, zIndex: "" };
            const nextCount = Math.max(0, current.count - 1);
            if (nextCount === 0) {
              animationLayerCountsRef.current.delete(item);
              item.style.zIndex = current.zIndex;
              if (isTowerLike && item === parentEl) item.classList.remove("hopping");
              return;
            }
            animationLayerCountsRef.current.set(item, { ...current, count: nextCount });
          });
          if (isKeep) el.classList.remove("flying");
          if (!isTowerLike) el.classList.remove("jumping", "flipX");
        };

        let moveInfo = getMoveInfo({ id, game, prevGame, boardSize, isTowerLike });
        if (!isTowerLike && newlySafeWizards.has(id)) {
          const prevWizard = prevGame?.wizards.find((wizard) => wizard.id === id);
          const toTileIndex = newlySafeWizards.get(id);
          if (prevWizard?.tileIndex != null && toTileIndex != null) {
            const cwSteps = (toTileIndex - prevWizard.tileIndex + boardSize) % boardSize;
            const ccwSteps = (prevWizard.tileIndex - toTileIndex + boardSize) % boardSize;
            const direction = ccwSteps < cwSteps ? -1 : 1;
            moveInfo = {
              fromTileIndex: prevWizard.tileIndex,
              toTileIndex,
              steps: direction === -1 ? ccwSteps : cwSteps,
              direction
            };
          }
        }
        const prevTower = isTowerLike ? prevGame?.towers.find((tower) => tower.id === id) : carriedTower?.prevTower ?? null;
        const curTower = isTowerLike ? game.towers.find((tower) => tower.id === id) : carriedTower?.curTower ?? null;
        const movingTowerIds = getMovingTowerIds({ game, prevGame, fromTileIndex: moveInfo.fromTileIndex, toTileIndex: moveInfo.toTileIndex });
        const sourceSupportHeight = followsTower && prevGame && moveInfo.fromTileIndex != null
          ? prevGame.towers.filter((tower) => tower.tileIndex === moveInfo.fromTileIndex && !movingTowerIds.has(tower.id)).length
          : 0;
        const movingRelativeLevel = followsTower && prevTower
          ? Math.max(0, prevTower.level - sourceSupportHeight)
          : 0;
        const finalTowerPoint = followsTower && moveInfo.toTileIndex != null && curTower
          ? towerTileLevelPoint(moveInfo.toTileIndex, curTower.level, layoutOptions)
          : null;
        const towerPoint = (tileIndex, desiredLevel) => {
          if (moveInfo.toTileIndex == null || !curTower) return null;
          const point = towerTileLevelPoint(tileIndex, desiredLevel, layoutOptions);
          if (!point || !finalTowerPoint) return null;
          return { x: point.x - finalTowerPoint.x, y: point.y - finalTowerPoint.y };
        };
        const supportHeightAt = (tileIndex) => {
          if (!prevGame) return 0;
          return prevGame.towers.filter((tower) => tower.tileIndex === tileIndex && !movingTowerIds.has(tower.id)).length;
        };
        const startLevel = sourceSupportHeight + movingRelativeLevel;
        const towerStart = followsTower && moveInfo.fromTileIndex != null && prevTower
          ? towerPoint(moveInfo.fromTileIndex, startLevel)
          : null;
        const keyframes = [{ transform: `translate(${towerStart?.x ?? dx}px, ${towerStart?.y ?? dy}px)`, offset: 0 }];
        const keepMovesAlone = isKeep && movingTowerIds.size <= 1;
        const shouldFlyKeep = isKeep && (newlySafeWizards.size > 0 || keepMovesAlone);
        const swapArc = getTowerSwapArc({
          id,
          game,
          prevGame,
          layoutOptions,
          isTowerLike,
          carriedTower,
          fallbackStart: towerStart ?? { x: dx, y: dy }
        });
        let totalMs;

        if (swapArc) {
          totalMs = TOWER_SWAP_ARC_MS;
          keyframes.splice(0, keyframes.length, ...swapArc.keyframes);
          if (isTowerLike) activeJumpPaths.push({ id, name: curTower?.name ?? id, points: swapArc.points });
        } else if (shouldFlyKeep && moveInfo.fromTileIndex != null && moveInfo.toTileIndex != null && curTower) {
          const keepFlight = buildKeepArcKeyframes({
            fromTileIndex: moveInfo.fromTileIndex,
            toTileIndex: moveInfo.toTileIndex,
            direction: moveInfo.direction,
            startLevel,
            finalLevel: curTower.level,
            boardSize,
            layoutOptions,
            fallbackStart: towerStart ?? { x: dx, y: dy }
          });
          totalMs = Math.max(1, Math.round(keepFlight.distance / RAVENSKEEP_FLIGHT_PX_PER_MS));
          const arcKeyframes = keepFlight.keyframes;
          keyframes.splice(0, keyframes.length, ...arcKeyframes);
          const startPoint = towerTileLevelPoint(moveInfo.fromTileIndex, startLevel, layoutOptions);
          const endPoint = towerTileLevelPoint(moveInfo.toTileIndex, curTower.level, layoutOptions);
          if (startPoint && endPoint) activeJumpPaths.push({ id, name: curTower.name ?? id, points: [startPoint, endPoint] });
        } else if (moveInfo.steps >= 1 && moveInfo.fromTileIndex != null) {
          const pauseMs = followsTower ? PAUSE_MS : WIZARD_PAUSE_MS;
          totalMs = moveInfo.steps * HOP_MS + Math.max(0, moveInfo.steps - 1) * pauseMs;
          const hopHeight = followsTower ? 36 : 26;
          const afterCX = after.left + after.width / 2;
          const afterCY = after.top + after.height / 2;
          const points = [towerStart ?? { x: dx, y: dy }];
          const jumpPathPoints = isTowerLike
            ? [towerTileLevelPoint(moveInfo.fromTileIndex, startLevel, layoutOptions)].filter(Boolean)
            : [];

          for (let i = 1; i < moveInfo.steps; i++) {
            const tileIndex = (moveInfo.fromTileIndex + i * moveInfo.direction + boardSize) % boardSize;
            const c = tileCenters.get(tileIndex);
            if (followsTower) {
              const supportHeight = supportHeightAt(tileIndex);
              const level = supportHeight + movingRelativeLevel;
              points.push(towerPoint(tileIndex, level) ?? { x: 0, y: 0 });
              if (isTowerLike) {
                const pathPoint = towerTileLevelPoint(tileIndex, level, layoutOptions);
                if (pathPoint) jumpPathPoints.push(pathPoint);
              }
            } else {
              const wizardPathPoint = wizardIntermediatePoint({
                wizardId: id,
                tileIndex,
                prevGame,
                wizardAnchors
              });
              points.push({
                x: wizardPathPoint ? wizardPathPoint.x - afterCX : c ? c.x - afterCX : 0,
                y: wizardPathPoint ? wizardPathPoint.y - afterCY : c ? c.y - afterCY : 0
              });
            }
          }

          points.push(followsTower && moveInfo.toTileIndex != null && curTower
            ? towerPoint(moveInfo.toTileIndex, curTower.level) ?? { x: 0, y: 0 }
            : { x: 0, y: 0 });
          if (isTowerLike && finalTowerPoint) {
            jumpPathPoints.push(finalTowerPoint);
            activeJumpPaths.push({ id, name: curTower?.name ?? id, points: jumpPathPoints });
          }

          addHopKeyframes({ keyframes, points, totalMs, hopHeight, steps: moveInfo.steps, pauseMs });
        } else {
          totalMs = isKeep || isTower ? 300 : 220;
          keyframes.push({ transform: "translate(0, 0)", offset: 1 });
        }

        const animationDelay = isKeep && newlySafeWizards.size > 0
          ? getSafeWizardJumpMs({ game, prevGame, safeWizards: newlySafeWizards }) + RAVENSKEEP_AFTER_WIZARD_DELAY_MS
          : shouldFlyKeep || swapArc ? 0 : followsTower ? TOWER_HOP_DELAY_MS : 0;
        let flyingTimeout = null;
        if (shouldFlyKeep) {
          flyingTimeout = window.setTimeout(() => {
            el.classList.add("flying");
          }, animationDelay);
        }
        const anim = el.animate(keyframes, {
          duration: totalMs,
          delay: animationDelay,
          easing: "linear",
          fill: followsTower ? "backwards" : "none"
        });
        runningAnimations += 1;

        let didFinishAnimation = false;
        const finishAnimation = () => {
          if (didFinishAnimation) return;
          didFinishAnimation = true;
          if (flyingTimeout) window.clearTimeout(flyingTimeout);
          cleanup();
          runningAnimations -= 1;
          if (runningAnimations <= 0) {
            document.documentElement.classList.remove("tower-hop-pending");
            setHiddenShadowTileIndexes(new Set());
            setIsAnimatingPieces(false);
          }
        };
        anim.addEventListener("finish", finishAnimation);
        anim.addEventListener("cancel", finishAnimation);
      });

      if (runningAnimations === 0) {
        document.documentElement.classList.remove("tower-hop-pending");
        setHiddenShadowTileIndexes(new Set());
        setIsAnimatingPieces(false);
      }
      setTowerJumpPaths(activeJumpPaths);
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (!didStartAnimationSetup) {
        document.documentElement.classList.remove("tower-hop-pending");
        setIsAnimatingPieces(false);
      }
    };
  }, [game, layoutOptions?.tileStepY, layoutOptions?.towerLevelHeight]);

  return { captureState, towerJumpPaths, hiddenShadowTileIndexes, lingeringCapturedWizardIds, lingeringSafeWizards, isAnimatingPieces };
}

function getMoveInfo({ id, game, prevGame, boardSize, isTowerLike }) {
  const result = { steps: 0, direction: 1, fromTileIndex: null, toTileIndex: null };
  if (!prevGame) return result;
  const prevPiece = isTowerLike
    ? prevGame.towers.find((tower) => tower.id === id)
    : prevGame.wizards.find((wizard) => wizard.id === id);
  const curPiece = isTowerLike
    ? game.towers.find((tower) => tower.id === id)
    : game.wizards.find((wizard) => wizard.id === id);
  if (prevPiece?.tileIndex != null && curPiece?.tileIndex != null && prevPiece.tileIndex !== curPiece.tileIndex) {
    const recordedMove = movementForPiece({ id, type: isTowerLike ? "tower" : "wizard", game, prevPiece, curPiece });
    if (recordedMove) {
      result.steps = recordedMove.steps;
      result.direction = recordedMove.direction;
      result.fromTileIndex = recordedMove.fromTileIndex;
      result.toTileIndex = recordedMove.toTileIndex;
      return result;
    }
    const clockwiseSteps = (curPiece.tileIndex - prevPiece.tileIndex + boardSize) % boardSize;
    const counterClockwiseSteps = (prevPiece.tileIndex - curPiece.tileIndex + boardSize) % boardSize;
    const canUseCounterClockwise = !isTowerLike || prevPiece.kind !== "keep";
    if (canUseCounterClockwise && counterClockwiseSteps < clockwiseSteps) {
      result.steps = counterClockwiseSteps;
      result.direction = -1;
    } else {
      result.steps = clockwiseSteps;
      result.direction = 1;
    }
    result.fromTileIndex = prevPiece.tileIndex;
    result.toTileIndex = curPiece.tileIndex;
  }
  return result;
}

function movementForPiece({ id, type, game, prevPiece, curPiece }) {
  const moves = Array.isArray(game?.lastMoves) ? game.lastMoves : [];
  const direct = moves.find((move) => (
    move.type === type &&
    move.id === id &&
    move.fromTileIndex === prevPiece.tileIndex &&
    move.toTileIndex === curPiece.tileIndex
  ));
  if (direct) return normalizeRecordedMove(direct);

  if (type === "wizard" && prevPiece?.standingOn && prevPiece.standingOn === curPiece?.standingOn) {
    const carriedByTower = moves.find((move) => (
      move.type === "tower" &&
      move.id === prevPiece.standingOn &&
      move.fromTileIndex === prevPiece.tileIndex &&
      move.toTileIndex === curPiece.tileIndex
    ));
    if (carriedByTower) return normalizeRecordedMove(carriedByTower);
  }

  return null;
}

function normalizeRecordedMove(move) {
  const rawSteps = Number(move.steps) || 0;
  const steps = Math.abs(rawSteps);
  if (!steps) return null;
  return {
    steps,
    direction: rawSteps < 0 || move.direction === -1 ? -1 : 1,
    fromTileIndex: move.fromTileIndex,
    toTileIndex: move.toTileIndex
  };
}

function didPieceStateChange({ id, game, prevGame, isTowerLike }) {
  if (!game || !prevGame) return true;
  const prevPiece = isTowerLike
    ? prevGame.towers.find((tower) => tower.id === id)
    : prevGame.wizards.find((wizard) => wizard.id === id);
  const curPiece = isTowerLike
    ? game.towers.find((tower) => tower.id === id)
    : game.wizards.find((wizard) => wizard.id === id);
  if (!prevPiece || !curPiece) return true;

  if (isTowerLike) {
    return prevPiece.tileIndex !== curPiece.tileIndex || prevPiece.level !== curPiece.level;
  }

  return (
    prevPiece.tileIndex !== curPiece.tileIndex ||
    prevPiece.standingOn !== curPiece.standingOn ||
    prevPiece.capturedBy !== curPiece.capturedBy ||
    prevPiece.safe !== curPiece.safe
  );
}

function getTowerSwapArc({ id, game, prevGame, layoutOptions, isTowerLike, carriedTower, fallbackStart }) {
  if (!game || !prevGame) return null;
  const prevTower = isTowerLike ? prevGame.towers.find((tower) => tower.id === id) : carriedTower?.prevTower;
  const curTower = isTowerLike ? game.towers.find((tower) => tower.id === id) : carriedTower?.curTower;
  if (!prevTower || !curTower) return null;
  if (prevTower.tileIndex == null || curTower.tileIndex == null || prevTower.tileIndex === curTower.tileIndex) return null;

  const partner = game.towers
    .map((tower) => {
      const before = prevGame.towers.find((item) => item.id === tower.id);
      return before ? { before, after: tower } : null;
    })
    .filter(Boolean)
    .find(({ before, after }) => (
      before.id !== curTower.id &&
      before.kind !== "keep" &&
      after.kind !== "keep" &&
      before.tileIndex === curTower.tileIndex &&
      after.tileIndex === prevTower.tileIndex
    ));
  if (!partner) return null;

  const start = towerTileLevelPoint(prevTower.tileIndex, prevTower.level, layoutOptions);
  const end = towerTileLevelPoint(curTower.tileIndex, curTower.level, layoutOptions);
  if (!start || !end) {
    return {
      keyframes: [
        { transform: `translate(${fallbackStart.x}px, ${fallbackStart.y}px)`, offset: 0 },
        { transform: "translate(0, 0)", offset: 1 }
      ],
      points: []
    };
  }

  const center = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2
  };
  const radius = Math.max(1, Math.hypot(start.x - center.x, start.y - center.y));
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const direction = 1;
  const points = Array.from({ length: 9 }, (_, index) => {
    const t = index / 8;
    const angle = startAngle + direction * Math.PI * t;
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius
    };
  });

  return {
    keyframes: points.map((point, index) => ({
      transform: index === points.length - 1
        ? "translate(0, 0)"
        : `translate(${Math.round(point.x - end.x)}px, ${Math.round(point.y - end.y)}px)`,
      offset: index / Math.max(1, points.length - 1)
    })),
    points
  };
}

function buildKeepArcKeyframes({ fromTileIndex, toTileIndex, direction = 1, startLevel, finalLevel, boardSize, layoutOptions, fallbackStart }) {
  const start = towerTileLevelPoint(fromTileIndex, startLevel, layoutOptions);
  const end = towerTileLevelPoint(toTileIndex, finalLevel, layoutOptions);
  if (!start || !end) {
    return {
      distance: Math.hypot(fallbackStart.x, fallbackStart.y),
      keyframes: [
        { transform: `translate(${fallbackStart.x}px, ${fallbackStart.y}px)`, offset: 0 },
        { transform: "translate(0, 0)", offset: 1 }
      ]
    };
  }

  const startAngle = Math.atan2(start.y, start.x);
  const endAngle = Math.atan2(end.y, end.x);
  const deltaAngle = signedAngleDelta(startAngle, endAngle, direction);
  const startRadius = Math.hypot(start.x, start.y);
  const endRadius = Math.hypot(end.x, end.y);
  const lift = Math.max(64, Math.min(118, Math.hypot(end.x - start.x, end.y - start.y) * 0.32));
  const clearance = (layoutOptions?.towerLevelHeight ?? 12) * RAVENSKEEP_FLIGHT_CLEARANCE_LEVELS;
  const points = [];

  for (let index = 0; index <= 8; index += 1) {
    const t = index / 8;
    const eased = easeInOutSine(t);
    const flightPlateau = Math.min(1, t / 0.18, (1 - t) / 0.18);
    const angle = startAngle + deltaAngle * eased;
    const radius = startRadius + (endRadius - startRadius) * eased;
    const arcX = Math.cos(angle) * radius;
    const arcY = Math.sin(angle) * radius - Math.sin(Math.PI * t) * lift - Math.max(0, flightPlateau) * clearance;
    points.push({ x: arcX, y: arcY });
  }

  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    distances[index] = distances[index - 1] + Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  const totalDistance = distances[distances.length - 1] || Math.hypot(end.x - start.x, end.y - start.y);
  const frames = points.map((point, index) => ({
    transform: `translate(${point.x - end.x}px, ${point.y - end.y}px)`,
    offset: totalDistance > 0 ? distances[index] / totalDistance : index / Math.max(1, points.length - 1)
  }));
  frames[frames.length - 1] = { transform: "translate(0, 0)", offset: 1 };
  return { distance: totalDistance, keyframes: frames };
}

function clockwiseAngleDelta(from, to) {
  let delta = to - from;
  while (delta < 0) delta += Math.PI * 2;
  while (delta === 0) delta += Math.PI * 2;
  return delta;
}

function signedAngleDelta(from, to, direction) {
  if (direction === -1) {
    let delta = to - from;
    while (delta > 0) delta -= Math.PI * 2;
    while (delta === 0) delta -= Math.PI * 2;
    return delta;
  }
  return clockwiseAngleDelta(from, to);
}

function easeInOutSine(t) {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function getCarriedTower({ id, game, prevGame }) {
  if (!prevGame || !game) return null;
  const prevWizard = prevGame.wizards.find((wizard) => wizard.id === id);
  const curWizard = game.wizards.find((wizard) => wizard.id === id);
  if (!prevWizard?.standingOn || !curWizard || prevWizard.standingOn !== curWizard.standingOn) return null;
  if (prevWizard.tileIndex == null || curWizard.tileIndex == null || prevWizard.tileIndex === curWizard.tileIndex) return null;

  const prevTower = prevGame.towers.find((tower) => tower.id === prevWizard.standingOn);
  const curTower = game.towers.find((tower) => tower.id === prevWizard.standingOn);
  if (!prevTower || !curTower) return null;
  if (prevTower.tileIndex !== prevWizard.tileIndex || curTower.tileIndex !== curWizard.tileIndex) return null;
  return { prevTower, curTower };
}

function getMovingTowerIds({ game, prevGame, fromTileIndex, toTileIndex }) {
  if (!prevGame || fromTileIndex == null || toTileIndex == null) return new Set();
  return new Set(game.towers
    .filter((tower) => {
      const beforeTower = prevGame.towers.find((item) => item.id === tower.id);
      return beforeTower?.tileIndex === fromTileIndex && tower.tileIndex === toTileIndex;
    })
    .map((tower) => tower.id));
}

function getNewlyCapturedWizardPlacements({ game, prevGame }) {
  if (!game || !prevGame) return new Map();
  return new Map(game.wizards
    .map((wizard) => {
      const before = prevGame.wizards.find((item) => item.id === wizard.id);
      if (!before || before.capturedBy || !wizard.capturedBy || wizard.tileIndex == null) return null;
      const previousTileIndex = before.tileIndex ?? wizard.tileIndex;
      if (previousTileIndex == null) return null;
      const previousOccupants = prevGame.wizards.filter((item) => (
        item.tileIndex === previousTileIndex &&
        !item.safe &&
        !item.capturedBy
      ));
      const slotIndex = Math.max(0, previousOccupants.findIndex((item) => item.id === wizard.id));
      const previousStackSize = prevGame.towers.filter((tower) => tower.tileIndex === previousTileIndex).length;
      return [wizard.id, {
        previousStackSize,
        slot: wizardStackSlot(slotIndex, previousOccupants.length || 1)
      }];
    })
    .filter(Boolean));
}

function getNewlyReleasedWizardIds({ game, prevGame }) {
  if (!game || !prevGame) return new Set();
  return new Set(game.wizards
    .filter((wizard) => {
      const before = prevGame.wizards.find((item) => item.id === wizard.id);
      return before?.capturedBy && !wizard.capturedBy && !wizard.safe && wizard.tileIndex != null;
    })
    .map((wizard) => wizard.id));
}

function getCapturedWizardLingerMs({ game, prevGame, wizardIds }) {
  if (!game || !prevGame || !wizardIds.size) return 220;
  const boardSize = game.board.length;
  const maxTowerSteps = [...wizardIds].reduce((maxSteps, wizardId) => {
    const wizard = game.wizards.find((item) => item.id === wizardId);
    const tower = wizard?.capturedBy ? game.towers.find((item) => item.id === wizard.capturedBy) : null;
    const beforeTower = tower ? prevGame.towers.find((item) => item.id === tower.id) : null;
    if (!tower || !beforeTower || beforeTower.tileIndex == null || tower.tileIndex == null) return maxSteps;
    const recordedMove = movementForPiece({ id: tower.id, type: "tower", game, prevPiece: beforeTower, curPiece: tower });
    const steps = recordedMove?.steps ?? Math.min(
      (tower.tileIndex - beforeTower.tileIndex + boardSize) % boardSize,
      (beforeTower.tileIndex - tower.tileIndex + boardSize) % boardSize
    );
    return Math.max(maxSteps, steps);
  }, 1);
  const totalMs = maxTowerSteps * HOP_MS + Math.max(0, maxTowerSteps - 1) * PAUSE_MS;
  return Math.max(160, TOWER_HOP_DELAY_MS + totalMs - 90);
}

function getNewlySafeWizards({ game, prevGame }) {
  if (!game || !prevGame) return new Map();
  return new Map(game.wizards
    .map((wizard) => {
      const before = prevGame.wizards.find((item) => item.id === wizard.id);
      if (!before || before.safe || !wizard.safe || before.tileIndex == null) return null;
      const keepBefore = prevGame.towers.find((tower) => tower.kind === "keep");
      if (keepBefore?.tileIndex == null) return null;
      return [wizard.id, keepBefore.tileIndex];
    })
    .filter(Boolean));
}

function getSafeWizardLingerMs({ game, prevGame, safeWizards }) {
  return Math.max(160, getSafeWizardJumpMs({ game, prevGame, safeWizards }) - 70);
}

function getSafeWizardJumpMs({ game, prevGame, safeWizards }) {
  if (!game || !prevGame || !safeWizards.size) return 220;
  const boardSize = game.board.length;
  const maxSteps = [...safeWizards].reduce((max, [wizardId, toTileIndex]) => {
    const before = prevGame.wizards.find((wizard) => wizard.id === wizardId);
    if (before?.tileIndex == null) return max;
    const after = game.wizards.find((wizard) => wizard.id === wizardId);
    const recordedMove = after ? movementForPiece({
      id: wizardId,
      type: "wizard",
      game,
      prevPiece: before,
      curPiece: { ...after, tileIndex: toTileIndex }
    }) : null;
    if (recordedMove) return Math.max(max, recordedMove.steps);
    const cwSteps = (toTileIndex - before.tileIndex + boardSize) % boardSize;
    const ccwSteps = (before.tileIndex - toTileIndex + boardSize) % boardSize;
    const steps = Math.min(cwSteps, ccwSteps);
    return Math.max(max, steps);
  }, 1);
  return maxSteps * HOP_MS + Math.max(0, maxSteps - 1) * WIZARD_PAUSE_MS;
}

function wizardIntermediatePoint({ wizardId, tileIndex, prevGame, wizardAnchors }) {
  if (!prevGame) return null;
  const anchor = wizardAnchors.get(tileIndex);
  if (!anchor) return null;

  const occupiedCount = prevGame.wizards.filter((wizard) => (
    wizard.id !== wizardId &&
    wizard.tileIndex === tileIndex &&
    !wizard.safe &&
    !wizard.capturedBy
  )).length;
  const slot = wizardStackSlot(occupiedCount, occupiedCount + 1);

  return {
    x: anchor.x + slot.x,
    y: anchor.y + slot.y - 0.5
  };
}

function addHopKeyframes({ keyframes, points, totalMs, hopHeight, steps, pauseMs = PAUSE_MS }) {
  let elapsed = 0;
  for (let i = 0; i < steps; i++) {
    const from = points[i];
    const to = points[i + 1];
    const apex = {
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2 - hopHeight
    };
    keyframes.push({
      transform: `translate(${Math.round(apex.x)}px, ${Math.round(apex.y)}px) scale(1.04)`,
      offset: (elapsed + HOP_MS * 0.48) / totalMs,
      easing: "cubic-bezier(.2, .7, .2, 1)"
    });
    keyframes.push({
      transform: `translate(${Math.round(to.x)}px, ${Math.round(to.y)}px) scale(1)`,
      offset: (elapsed + HOP_MS) / totalMs,
      easing: "cubic-bezier(.35, 0, .75, .35)"
    });
    elapsed += HOP_MS;
    if (i < steps - 1) {
      keyframes.push({
        transform: `translate(${Math.round(to.x)}px, ${Math.round(to.y)}px) scale(1)`,
        offset: (elapsed + pauseMs) / totalMs
      });
      elapsed += pauseMs;
    }
  }
}
