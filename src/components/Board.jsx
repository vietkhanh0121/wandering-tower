import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { TOWER_LEVEL_HEIGHT, ringPositions } from "../game/tower-layout";
import { tileOccupants, towerStack } from "../game/rules";
import { shouldShiftBoardForExpandedStack, towerArcOffset, towerArcTilt } from "../game/tower-stack-view";
import { assignWizardSlots, wizardDebugLabel, wizardVisualTileIndex } from "../game/wizard-view";
import { WIZARD_EMPTY_TILE_EXTRA_OFFSET_Y, WIZARD_STAND_OFFSET_Y } from "../game/wizard-layout";
import { spritePath, tileSpritePath } from "../lib/sprites";
import { DiceOverlay } from "./DiceOverlay";

const SLOT_PRIMARY_VALUES = ["Tháp", "Phù thuỷ", "Sách phép", "Bí thuật"];
const SLOT_MOVE_TARGETS = new Set(["Tháp", "Phù thuỷ"]);
const SLOT_MOVE_ACTIONS = ["-", "+"];
const SLOT_MOVE_STEPS = ["0", "1", "2", "3", "4"];
const SLOT_BOOK_ACTIONS = ["Dùng", "Đổi"];
const SLOT_BOOK_COUNTS = ["0", "1", "2"];

function randomIndex(length) {
  return Math.floor(Math.random() * length);
}

function buildSlotSpin() {
  const firstStopIndex = randomIndex(SLOT_PRIMARY_VALUES.length);
  const firstValue = SLOT_PRIMARY_VALUES[firstStopIndex];
  const secondValues = SLOT_MOVE_TARGETS.has(firstValue) ? SLOT_MOVE_ACTIONS : SLOT_BOOK_ACTIONS;
  const thirdValues = SLOT_MOVE_TARGETS.has(firstValue) ? SLOT_MOVE_STEPS : SLOT_BOOK_COUNTS;

  return [
    { values: SLOT_PRIMARY_VALUES, stopIndex: firstStopIndex },
    { values: secondValues, stopIndex: randomIndex(secondValues.length) },
    { values: thirdValues, stopIndex: randomIndex(thirdValues.length) }
  ];
}

function towerArcOffsetAtLevel(pos, level, total) {
  if (total <= 1 || level === 0) return { x: 0, y: 0 };
  const t = level / Math.max(1, total - 1);
  const radius = 300;
  const centerX = pos.x < 0 ? radius : -radius;
  const baseAngle = pos.x < 0 ? Math.PI : 0;
  const direction = pos.x < 0 ? 1 : -1;
  const maxSweep = 50 * Math.PI / 180;
  const maxStackSize = 8;
  const stepAngle = maxSweep / (maxStackSize - 1);
  const sweep = Math.min(maxSweep, stepAngle * (total - 1));
  const angle = baseAngle + direction * sweep * t;

  return {
    x: Math.round(centerX + Math.cos(angle) * radius),
    y: Math.round(Math.sin(angle) * radius)
  };
}

export function Board({ game, selectedType, selectableIds, highlightedTileIds, winnerInfo, localPlayerId = "p1", isForbiddenTargeting, forbiddenTargetType, onPlayTarget, onForbiddenDeselect, onUseForbidden, imprisoningTowerIds, onNewGame, debugWizards, debugShowTowers, debugShowWizards, debugShowWizardNames, debugShowTowerNames, debugShowTileNames, debugShowTowerPaths, debugShowDiceOverlay, diceContext, diceReadOnly, diceForcedRoll, actionVisual, turnPrompt, idleReminder, onDiceRollStart, onDiceRollComplete, debugShowSlotMachine, tileStepY, towerStackStep, wizardOffsetY, towerJumpPaths, hiddenShadowTileIndexes, lingeringCapturedWizardIds, lingeringSafeWizards, expandedStackIndex, onSetExpandedStackIndex, statusBarContent, turnStartContent }) {
  const positions = useMemo(() => ringPositions(game.board.length, {
    tileStepY,
    towerLevelHeight: towerStackStep
  }), [game.board.length, tileStepY, towerStackStep]);
  const expandedStack = debugShowTowers && expandedStackIndex != null ? towerStack(game, expandedStackIndex) : [];
  const resultSprite = winnerInfo ? winnerResultSprite(winnerInfo, localPlayerId) : null;
  const resultIsWin = winnerInfo ? isWinningResult(winnerInfo, localPlayerId) : false;
  const [boardShiftY, setBoardShiftY] = useState(36);
  const boardRef = useRef(null);

  useLayoutEffect(() => {
    const baseShift = 36;
    const expandedPos = expandedStackIndex != null ? positions[expandedStackIndex] : null;
    if (!expandedPos || expandedStack.length === 0) {
      setBoardShiftY(baseShift);
      return;
    }

    const boardHeight = boardRef.current?.clientHeight ?? 0;
    const tokenOffsets = Array.from({ length: expandedStack.length }, (_, level) =>
      towerArcOffset(expandedPos, level, expandedStack.length)
    );
    const margin = 8;
    const tokenHeight = 24;

    const stackTopAtBase = baseShift + boardHeight / 2 + expandedPos.y - 20 + Math.min(...tokenOffsets.map((o) => o.y));
    const overflowTop = margin - stackTopAtBase;
    const shiftDown = Math.max(0, Math.ceil(overflowTop));

    const proposedShift = baseShift + shiftDown;
    const stackBottomAtProposed = proposedShift + boardHeight / 2 + expandedPos.y + Math.max(...tokenOffsets.map((o) => o.y)) + tokenHeight;
    const overflowBottom = stackBottomAtProposed - (boardHeight - margin);
    const finalShift = proposedShift - Math.max(0, Math.ceil(overflowBottom));

    setBoardShiftY(Math.max(baseShift, finalShift));
  }, [expandedStack.length, expandedStackIndex, positions]);

  return (
    <section className="boardWrap" ref={boardRef} style={{ "--board-shift-y": `${boardShiftY}px` }} onClick={() => { onSetExpandedStackIndex(null); onForbiddenDeselect?.(); }}>
      {statusBarContent}
      {turnStartContent}
      <div
        className="isoBoard"
        style={{}}
      >
        {debugWizards && debugShowTowerPaths && towerJumpPaths.length > 0 && <TowerJumpPathOverlay paths={towerJumpPaths} />}
        {debugWizards && expandedStackIndex != null && expandedStack.length > 0 && <TowerArcOverlay pos={positions[expandedStackIndex]} stackLength={expandedStack.length} />}
        {debugShowDiceOverlay && <DiceOverlay context={diceContext} readOnly={diceReadOnly} forcedRoll={diceForcedRoll} onRollStart={onDiceRollStart} onRollComplete={onDiceRollComplete} />}
        {!debugShowDiceOverlay && actionVisual && (
          <RemoteActionVisual action={actionVisual} />
        )}
        {turnPrompt && (
          <TurnMapPrompt prompt={turnPrompt} />
        )}
        {idleReminder && (
          <div className="idleTurnReminder" role="status" aria-live="polite">
            {idleReminder}
          </div>
        )}
        {game.board.map((tile, index) => (
          <Tile
            key={`${tile.id}-terrain`}
            layer="terrain"
            game={game}
            tile={tile}
            index={index}
            pos={positions[index]}
            selectedType={selectedType}
            selectableIds={selectableIds}
            highlightedTileIds={highlightedTileIds}
            isForbiddenTargeting={isForbiddenTargeting}
            onPlayTarget={onPlayTarget}
            onForbiddenDeselect={onForbiddenDeselect}
            forbiddenTargetType={forbiddenTargetType}
            debugWizards={debugWizards}
            debugShowWizards={debugShowWizards}
            debugShowTowerNames={debugShowTowerNames}
            debugShowWizardNames={debugShowWizardNames}
            debugShowTileNames={debugShowTileNames}
            towerStackStep={towerStackStep}
            wizardOffsetY={wizardOffsetY}
            hiddenShadowTileIndexes={hiddenShadowTileIndexes}
            lingeringCapturedWizardIds={lingeringCapturedWizardIds}
            lingeringSafeWizards={lingeringSafeWizards}
            expandedStackIndex={expandedStackIndex}
            onSetExpandedStackIndex={onSetExpandedStackIndex}
          />
        ))}
        {game.board.map((tile, index) => (
          <Tile
            key={`${tile.id}-pieces`}
            imprisoningTowerIds={imprisoningTowerIds}
            layer="pieces"
            game={game}
            tile={tile}
            index={index}
            pos={positions[index]}
            selectedType={selectedType}
            selectableIds={selectableIds}
            highlightedTileIds={highlightedTileIds}
            isForbiddenTargeting={isForbiddenTargeting}
            onPlayTarget={onPlayTarget}
            onForbiddenDeselect={onForbiddenDeselect}
            forbiddenTargetType={forbiddenTargetType}
            debugWizards={debugWizards}
            debugShowTowers={debugShowTowers}
            debugShowWizards={debugShowWizards}
            debugShowTowerNames={debugShowTowerNames}
            debugShowWizardNames={debugShowWizardNames}
            debugShowTileNames={debugShowTileNames}
            towerStackStep={towerStackStep}
            wizardOffsetY={wizardOffsetY}
            hiddenShadowTileIndexes={hiddenShadowTileIndexes}
            lingeringCapturedWizardIds={lingeringCapturedWizardIds}
            lingeringSafeWizards={lingeringSafeWizards}
            expandedStackIndex={expandedStackIndex}
            onSetExpandedStackIndex={onSetExpandedStackIndex}
          />
        ))}
      </div>
      {resultSprite && (
        <div className={resultIsWin ? "gameResultBanner isWin" : "gameResultBanner isLose"} aria-live="polite">
          {resultIsWin && (
            <span className="gameResultSparkles" aria-hidden="true">
              {Array.from({ length: 7 }).map((_, index) => <i key={index} />)}
            </span>
          )}
          <img className="gameResultSprite" src={resultSprite} alt={winnerInfo?.id === localPlayerId ? "Thắng" : "Thua"} />
          {onNewGame && (
            <button className="boardNewGameBtn gameResultNewGameBtn" onClick={(e) => { e.stopPropagation(); onNewGame(); }}>
              Ván mới
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function winnerResultSprite(winnerInfo, localPlayerId = "p1") {
  if (!winnerInfo || winnerInfo.id === "draw") return spritePath("items/lose");
  return isWinningResult(winnerInfo, localPlayerId)
    ? spritePath("items/win")
    : spritePath("items/lose");
}

function isWinningResult(winnerInfo, localPlayerId = "p1") {
  return winnerInfo?.id === localPlayerId || winnerInfo?.id === "debug-win";
}

function RemoteActionVisual({ action }) {
  return (
    <div
      className="remoteActionVisual"
      aria-live="polite"
    >
      {action.kind === "forbidden"
        ? <RemoteForbiddenVisual action={action} />
        : <RemoteSpellVisual action={action} />}
    </div>
  );
}

function RemoteSpellVisual({ action }) {
  const pages = action.spell?.pages ?? [];
  const selected = action.pageType;
  const bookDir = action.wizardColor ? `book-open_${action.wizardColor === "orange" ? "orange1" : action.wizardColor}` : "book-open";
  return (
    <span className="remoteSpellBook" style={{ "--remote-book": `url('${spritePath(`items/${bookDir}/frame-8`)}')` }}>
      <span className="remoteSpellPages">
        {["tower", "wizard"].map((type, index) => {
          const page = pages.find((item) => item.type === type);
          const pageClass = [
            "remoteSpellPage",
            index === 0 ? "leftPage" : "rightPage",
            page ? "" : "blank",
            page && selected === type ? "selected" : "",
            page && selected !== type ? "unused" : ""
          ].filter(Boolean).join(" ");
          return (
            <span key={type} className={pageClass}>
              {page ? (
                <>
                  <img src={spritePath(`items/${type === "tower" ? "tower-icon" : "wizard-icon"}`)} alt="" />
                  {page.diceRolls ? (
                    <b className="remoteDicePageValue"><span>{page.diceRolls}</span><i>⚂</i></b>
                  ) : (
                    <b>+{page.value}</b>
                  )}
                </>
              ) : (
                <img className="remoteBlankPageSprite" src={spritePath("items/blank-page")} alt="" />
              )}
            </span>
          );
        })}
      </span>
    </span>
  );
}

function RemoteForbiddenVisual({ action }) {
  const cost = Math.max(1, Math.min(3, action.spell?.potionCost ?? 1));
  const effect = action.spell?.shortEffect ?? action.spell?.effect ?? "Bí thuật";
  return (
    <span className="remoteForbiddenCard">
      <span className="remoteForbiddenCost">
        <span>{cost}x</span>
        <img src={spritePath(`items/potion-${action.wizardColor ?? "blue"}`)} alt="" />
      </span>
      <span className="remoteForbiddenEffect">
        {renderRemoteForbiddenEffect(effect)}
      </span>
    </span>
  );
}

function renderRemoteForbiddenEffect(text) {
  return String(text || "").split("✡").flatMap((part, index, parts) => (
    index < parts.length - 1
      ? [part, <span key={index} className="remoteForbiddenRavenIcon">✡</span>]
      : [part]
  ));
}

function TurnMapPrompt({ prompt }) {
  const currentFace = {
    key: prompt.key,
    isLocalTurn: prompt.isLocalTurn,
    color: prompt.color ?? "#050608",
    wizardColor: prompt.wizardColor ?? "blue"
  };
  const [turnFlipState, setTurnFlipState] = useState(() => ({
    side: "front",
    front: currentFace,
    back: currentFace
  }));

  useLayoutEffect(() => {
    setTurnFlipState((previous) => {
      const visibleFace = previous.side === "front" ? previous.front : previous.back;
      if (visibleFace.key === currentFace.key) return previous;
      return previous.side === "front"
        ? { ...previous, side: "back", back: currentFace }
        : { ...previous, side: "front", front: currentFace };
    });
  }, [currentFace.key, currentFace.isLocalTurn, currentFace.color, currentFace.wizardColor]);

  return (
    <div
      className={`turnMapPrompt turnFlipButton ${turnFlipState.side === "front" ? "showFront" : "showBack"}`}
      style={{ "--turn-color": currentFace.color }}
      aria-live="polite"
    >
      <span className="turnFlipInner">
        <TurnOrderFace face={turnFlipState.front} side="front" />
        <TurnOrderFace face={turnFlipState.back} side="back" />
      </span>
    </div>
  );
}

function TurnOrderFace({ face, side }) {
  return (
    <span className={`turnFlipFace turnFlip${side === "front" ? "Front" : "Back"} ${face.isLocalTurn ? "isLocalTurn" : "isOpponentTurn"}`}>
      {face.isLocalTurn ? (
        "Lượt của bạn"
      ) : (
        <>
          Lượt của
          <img className="turnOrderWizardIcon" src={spritePath(`characters/wizard-face/idle_${face.wizardColor ?? "blue"}`)} alt="" />
        </>
      )}
    </span>
  );
}

export function SlotMachineOverlay({ onClose }) {
  const [spinId, setSpinId] = useState(0);
  const [stoppedCount, setStoppedCount] = useState(0);
  const [slotSpin, setSlotSpin] = useState(() => buildSlotSpin());

  function handleOverlayClick(event) {
    event.stopPropagation();
    setStoppedCount((current) => {
      if (current >= 3) {
        setSlotSpin(buildSlotSpin());
        setSpinId((id) => id + 1);
        return 0;
      }
      return current + 1;
    });
  }

  return (
    <div className="slotMachineOverlay" onClick={handleOverlayClick}>
      <button
        className="slotMachineCloseBtn"
        type="button"
        aria-label="Đóng slot machine"
        onClick={(event) => {
          event.stopPropagation();
          onClose?.();
        }}
      >
        ×
      </button>
      <div key={spinId} className="slotMachine" aria-label="Slot machine">
        <div className="slotMachineWindow">
          {slotSpin.map((reel, index) => (
            <span
              key={index}
              className={index < stoppedCount ? "slotMachineReel stopped" : "slotMachineReel"}
              style={{
                "--slot-stop-index": reel.stopIndex,
                "--slot-cycle-height": `${reel.values.length * 36}px`,
                "--slot-reel-height": `${reel.values.length * 72}px`
              }}
            >
              <i>
                {[...reel.values, ...reel.values].map((value, valueIndex) => (
                  <b key={`${value}-${valueIndex}`}>{value}</b>
                ))}
              </i>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TowerArcOverlay({ pos, stackLength }) {
  const radius = 300;
  const maxSweep = 50 * Math.PI / 180;
  const stepAngle = maxSweep / 7;
  const sweep = Math.min(maxSweep, stepAngle * Math.max(1, stackLength - 1));
  const localCenterX = pos.x < 0 ? radius : -radius;
  const baseAngle = pos.x < 0 ? Math.PI : 0;
  const direction = pos.x < 0 ? 1 : -1;
  const cx = pos.x + localCenterX;
  const cy = pos.y;
  const TOWER_CENTER_Y_OFFSET = -19;

  const arcPoints = Array.from({ length: 60 }, (_, i) => {
    const t = (i / 59) * 1.15 - 0.1;
    const angle = baseAngle + direction * sweep * t;
    return `${Math.round(cx + Math.cos(angle) * radius)},${Math.round(cy + Math.sin(angle) * radius + TOWER_CENTER_Y_OFFSET)}`;
  }).join(" ");

  const towerPts = Array.from({ length: stackLength }, (_, level) => {
    const off = towerArcOffset(pos, level, stackLength);
    return { x: pos.x + off.x, y: pos.y + TOWER_CENTER_Y_OFFSET + off.y };
  });
  const wizardPts = Array.from({ length: stackLength }, (_, level) => {
    const off = towerArcOffsetAtLevel(pos, level + 2, stackLength);
    return { x: pos.x + off.x, y: pos.y + TOWER_CENTER_Y_OFFSET + off.y };
  });
  const nextLevelPts = Array.from({ length: stackLength }, (_, level) => {
    const off = towerArcOffsetAtLevel(pos, level + 1, stackLength);
    return { level: level + 1, x: pos.x + off.x, y: pos.y + TOWER_CENTER_Y_OFFSET + off.y };
  });

  return (
    <div className="towerJumpPathOverlay" aria-hidden="true">
      <svg className="towerJumpPathSvg" viewBox="-320 -300 640 600">
        <polyline points={arcPoints} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
        <circle cx={cx} cy={cy + TOWER_CENTER_Y_OFFSET} r={3} fill="rgba(255,255,255,0.4)" />
        {towerPts.map(({ x, y }, i) => (
          <g key={i}>
            <line x1={x} y1={y} x2={wizardPts[i].x} y2={wizardPts[i].y} stroke="rgba(0,210,255,0.4)" strokeWidth="1" strokeDasharray="3 2" />
            <circle cx={x} cy={y} r={6} fill="rgba(255,200,0,0.75)" stroke="#050608" strokeWidth="1" />
            <text x={x} y={y + 3} fill="#050608" fontSize="7" textAnchor="middle" fontWeight="bold">{i}</text>
          </g>
        ))}
        {wizardPts.map(({ x, y }, i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={4} fill="rgba(0,210,255,0.75)" stroke="#050608" strokeWidth="1" />
          </g>
        ))}
        {nextLevelPts.map(({ level, x, y }, i) => (
          <g key={`next-level-${i}`}>
            <line x1={towerPts[i].x} y1={towerPts[i].y} x2={x} y2={y} stroke="rgba(255,80,40,0.45)" strokeWidth="1" strokeDasharray="2 3" />
            <rect x={x - 8} y={y - 8} width="16" height="16" rx="4" fill="rgba(255,80,40,0.78)" stroke="#050608" strokeWidth="1" transform={`rotate(45 ${x} ${y})`} />
            <text x={x} y={y + 3} fill="#050608" fontSize="6.5" textAnchor="middle" fontWeight="bold">{`+${level}`}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function TowerJumpPathOverlay({ paths }) {
  return (
    <div className="towerJumpPathOverlay" aria-hidden="true">
      <svg className="towerJumpPathSvg" viewBox="-320 -300 640 600">
        {paths.map((path, index) => {
          const d = path.points.map((point, pointIndex) => `${pointIndex === 0 ? "M" : "L"} ${Math.round(point.x)} ${Math.round(point.y)}`).join(" ");
          return (
            <g key={`${path.id}-${index}`} className="towerJumpPathGroup">
              <path d={d} className="towerJumpPath" />
              {path.points.map((point, pointIndex) => (
                <circle key={pointIndex} cx={point.x} cy={point.y} r={pointIndex === path.points.length - 1 ? 4 : 3} className={pointIndex === path.points.length - 1 ? "towerJumpPathPoint end" : "towerJumpPathPoint"} />
              ))}
            </g>
          );
        })}
      </svg>
      {paths.map((path, index) => {
        const point = path.points[path.points.length - 1];
        if (!point) return null;
        return (
          <span
            key={`${path.id}-label-${index}`}
            className="towerJumpPathLabel"
            style={{ "--path-label-x": `${point.x}px`, "--path-label-y": `${point.y}px` }}
          >
            {path.name}
          </span>
        );
      })}
    </div>
  );
}

function Tile({ game, tile, index, pos, layer, selectedType, selectableIds, highlightedTileIds, isForbiddenTargeting, forbiddenTargetType, onPlayTarget, onForbiddenDeselect, debugWizards, debugShowTowers, debugShowWizards, debugShowTowerNames, debugShowWizardNames, debugShowTileNames, towerStackStep, wizardOffsetY, hiddenShadowTileIndexes, lingeringCapturedWizardIds, lingeringSafeWizards, imprisoningTowerIds, expandedStackIndex, onSetExpandedStackIndex }) {
  const occupants = tileOccupants(game, index);
  const lingeringCapturedOccupants = game.wizards.filter((wizard) => (
    lingeringCapturedWizardIds?.has(wizard.id) &&
    wizard.tileIndex === index &&
    !wizard.safe
  ));
  const lingeringSafeOccupants = game.wizards.filter((wizard) => (
    lingeringSafeWizards?.get(wizard.id) === index &&
    wizard.safe
  ));
  const visualOccupants = [...occupants, ...lingeringCapturedOccupants, ...lingeringSafeOccupants];
  const capturedHere = debugWizards
    ? game.wizards.filter((wizard) => !wizard.safe && wizard.capturedBy && !lingeringCapturedWizardIds?.has(wizard.id) && wizardVisualTileIndex(game, wizard) === index)
    : [];
  const stack = towerStack(game, index);
  const selectableTileId = `tile-${index}`;
  const selectableTile = selectedType === "tile" && selectableIds.has(selectableTileId);
  const highlightedTile = highlightedTileIds?.has(selectableTileId);
  const showDirectionArrow = index % 2 === 1;
  const nextPos = ringPositions(game.board.length)[(index + 1) % game.board.length];
  const directionAngle = nextPos ? Math.atan2(nextPos.y - pos.y, nextPos.x - pos.x) * 180 / Math.PI : 0;
  const selectableTower = selectedType === "tower" ? [...stack].reverse().find((tower) => selectableIds.has(tower.id)) : null;
  const isExpanded = selectedType === "tower" && expandedStackIndex === index && stack.length > 0;
  const shouldExpandForbiddenTowerStack = selectedType === "tower" && isForbiddenTargeting && forbiddenTargetType === "raven-tower" && stack.length > 1 && selectableTower;
  const towerStep = towerStackStep ?? TOWER_LEVEL_HEIGHT;
  const topTowerVisualOffset = stack.length > 0 ? -towerStep * Math.max(0, stack.length - 1) : towerStep + WIZARD_EMPTY_TILE_EXTRA_OFFSET_Y;
  const tileZIndex = layer === "pieces"
    ? (isExpanded ? 30000 + pos.zIndex : 1000 + pos.zIndex)
    : pos.zIndex;
  const tileStyle = {
    "--x": `${pos.x}px`,
    "--y": `${pos.y}px`,
    "--wizard-anchor-y": `${topTowerVisualOffset + (wizardOffsetY ?? WIZARD_STAND_OFFSET_Y)}px`,
    "--tower-step": `${towerStep}px`,
    zIndex: tileZIndex
  };

  if (layer === "terrain") {
    return (
      <div
        className="tile tileTerrain"
        data-tile-index={index}
        style={tileStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className={[
            "hexCell",
            selectableTower || selectableTile ? "selectable" : "",
            highlightedTile ? "selectedTile" : "",
            debugWizards ? "debugGrid" : ""
          ].filter(Boolean).join(" ")}
          onClick={(event) => {
            if (selectedType === "tile") {
              if (selectableTile) onPlayTarget(selectableTileId);
              else if (isForbiddenTargeting) onForbiddenDeselect?.();
              return;
            }
            if (selectedType === "tower") {
              if (shouldExpandForbiddenTowerStack && !isExpanded) {
                onSetExpandedStackIndex(index);
                return;
              }
              if ((isForbiddenTargeting || stack.length === 1) && selectableTower) {
                onPlayTarget(selectableTower.id);
                return;
              }
              onSetExpandedStackIndex(stack.length ? index : null);
              return;
            }
            if (selectableTower) onPlayTarget(selectableTower.id);
          }}
          aria-label={tile.name}
        >
          <img className="tileTerrainShadow" src={spritePath("terrain/shadow")} alt="" aria-hidden="true" />
          <img className="tileSprite" src={tileSpritePath(tile)} alt="" aria-hidden="true" />
          {showDirectionArrow && (
            <span
              className="tileDirectionArrow"
              style={{ "--direction-angle": `${directionAngle}deg` }}
              aria-hidden="true"
            >
              <span />
            </span>
          )}
          <svg className="hexSvg" viewBox="0 0 100 72" aria-hidden="true">
            <polygon points="50,4 97,36 50,68 3,36" />
          </svg>
        </button>
        {debugWizards && debugShowTileNames && <span className="tileNameDebug">T{index}</span>}
        <span className="tileMeta">{tile.lanterns}L{tile.hasRaven ? " · R" : ""}</span>
      </div>
    );
  }

  return (
    <div
      className="tile tilePieces"
      data-piece-tile-index={index}
      style={tileStyle}
      onClick={(event) => {
        event.stopPropagation();
        if (isForbiddenTargeting && selectedType === "tile" && !selectableTile) onForbiddenDeselect?.();
      }}
    >
      {highlightedTile && (
        <svg className="hexSelectionOverlay" viewBox="0 0 100 72" aria-hidden="true">
          <polygon points="50,4 97,36 50,68 3,36" />
        </svg>
      )}
      {stack.length > 0 && !hiddenShadowTileIndexes.has(index) && (
        <img
          className="tileTowerShadow"
          src={spritePath("towers/tower-shadow")}
          alt=""
          aria-hidden="true"
        />
      )}
      {debugShowTowers && stack.length > 0 && <span className={`${isExpanded ? "towerStack expanded" : "towerStack"} ${selectedType !== "tower" && !selectableTile ? "inactiveHitbox" : ""}`}>
        {stack.map((tower, level) => {
          const isSelectable = selectableIds.has(tower.id);
          const arcOffset = towerArcOffset(pos, level, stack.length);
          const arcTilt = towerArcTilt(pos, level, stack.length);
          const showTowerRaven = tower.kind !== "keep" && (tower.hasRaven || tower.tempRaven);
          const showMistVeil = tower.kind === "keep" && Boolean(game.mistVeil?.playerId);
          return (
            <button
              key={tower.id}
              data-flip-id={tower.id}
              data-bounce=""
              className={`${tower.kind === "keep" ? "keepToken" : showTowerRaven ? "towerToken ravenTower" : "towerToken"} ${isSelectable ? "selectable" : ""} ${level === 0 ? "baseTower" : ""} ${imprisoningTowerIds?.has(tower.id) ? "imprisoning" : ""}`}
              style={{
                "--level": level,
                "--arc-x": `${arcOffset.x}px`,
                "--arc-y": `${arcOffset.y}px`,
                "--arc-tilt": `${arcTilt}deg`
              }}
              onClick={(event) => {
                event.stopPropagation();
                if (tower.kind === "keep") return;
                if (selectedType === "tile") {
                  if (selectableTile) onPlayTarget(selectableTileId);
                  else if (isForbiddenTargeting) onForbiddenDeselect?.();
                  return;
                }
                if (selectedType === "tower" && !isExpanded && stack.length > 1 && (!isForbiddenTargeting || !isSelectable || shouldExpandForbiddenTowerStack)) {
                  onSetExpandedStackIndex(index);
                  return;
                }
                if (isSelectable) onPlayTarget(tower.id);
              }}
              disabled={tower.kind === "keep" || (!isSelectable && !selectableTile && !(shouldExpandForbiddenTowerStack && !isExpanded))}
              title={tower.name}
            >
              <span className="towerMark">
                <img
                  className="towerSprite"
                  src={spritePath(tower.kind === "keep" ? "towers/ravenskeep" : "towers/tower")}
                  alt=""
                />
                {showMistVeil && (
                  <img
                    className="mistVeilCloud mistVeilCloudBack"
                    src={spritePath("effects/cloud")}
                    alt=""
                    aria-hidden="true"
                  />
                )}
                {showTowerRaven && (
                  <img
                    className="towerRavenSprite"
                    src={spritePath("items/raven")}
                    alt=""
                    aria-hidden="true"
                  />
                )}
                {debugWizards && debugShowTowerNames && <span className="towerDebugTag">{tower.name}</span>}
                {showMistVeil && (
                  <img
                    className="mistVeilCloud mistVeilCloudFront"
                    src={spritePath("effects/cloud")}
                    alt=""
                    aria-hidden="true"
                  />
                )}
                {showMistVeil && <span className="mistVeilBlockMark" aria-hidden="true" />}
              </span>
            </button>
          );
        })}
      </span>}
      {debugShowWizards && <span className="wizardRow">
        {assignWizardSlots(visualOccupants).map(({ wizard, offset }, wizardIndex) => {
          const player = game.players.find((item) => item.id === wizard.playerId);
          const isLingeringCaptured = lingeringCapturedWizardIds?.has(wizard.id);
          const lingeringCapturedPlacement = typeof lingeringCapturedWizardIds?.get === "function"
            ? lingeringCapturedWizardIds.get(wizard.id)
            : null;
          const isLingeringSafe = lingeringSafeWizards?.has(wizard.id);
          const selectable = !isLingeringCaptured && selectableIds.has(wizard.id);
          const isWizardActive = selectedType === "wizard" && selectable;
          const visualOffset = isLingeringCaptured && lingeringCapturedPlacement?.slot
            ? lingeringCapturedPlacement.slot
            : offset;
          const showsWizardShadow = visualOffset.row === 2 && !isExpanded;
          const standingTowerLevel = stack.findIndex((tower) => tower.id === wizard.standingOn);
          const linkedTower = !isLingeringCaptured && standingTowerLevel >= 0 ? stack[standingTowerLevel] : null;
          const wizardArcOffset = linkedTower && isExpanded ? towerArcOffsetAtLevel(pos, standingTowerLevel + 2, stack.length) : null;
          const linkedArcTilt = linkedTower && isExpanded ? towerArcTilt(pos, standingTowerLevel, stack.length) : 0;
          const effectiveWizardOffsetY = wizardOffsetY ?? WIZARD_STAND_OFFSET_Y;
          const linkedX = wizardArcOffset ? wizardArcOffset.x : 0;
          const linkedY = wizardArcOffset ? wizardArcOffset.y + towerStep * Math.max(0, stack.length - 1) - effectiveWizardOffsetY - 3 : 0;
          const isAvailableLinkedWizard = Boolean(linkedTower && selectableIds.has(linkedTower.id));
          const capturedByTowerLevel = isLingeringCaptured ? stack.findIndex((tower) => tower.id === wizard.capturedBy) : -1;
          const previousStackSize = lingeringCapturedPlacement?.previousStackSize ?? Math.max(0, capturedByTowerLevel);
          const previousTopTowerVisualOffset = previousStackSize > 0
            ? -towerStep * Math.max(0, previousStackSize - 1)
            : towerStep + WIZARD_EMPTY_TILE_EXTRA_OFFSET_Y;
          const lingeringOffsetY = isLingeringCaptured ? previousTopTowerVisualOffset - topTowerVisualOffset : 0;
          return (
            <button
              key={wizard.id}
              data-flip-id={isLingeringCaptured ? undefined : wizard.id}
              data-bounce=""
              className={`${selectable ? "wizard selectable" : "wizard"} ${isWizardActive ? "wizardActive" : ""} wizardColor-${player.wizardColor ?? "blue"} ${linkedTower && isExpanded ? "linkedToTower stackJumping" : ""} ${isAvailableLinkedWizard ? "availableLinkedWizard" : ""} ${isLingeringCaptured ? "lingeringCaptured" : ""} ${isLingeringSafe ? "lingeringSafe" : ""} ${selectedType !== "wizard" || !selectable ? "inactiveHitbox" : ""}`}
              style={{
                "--player-color": player.color,
                "--wx": `${visualOffset.x}px`,
                "--wy": `${visualOffset.y}px`,
                "--linger-y": `${isExpanded && linkedTower ? 0 : lingeringOffsetY}px`,
                "--linked-x": `${linkedX}px`,
                "--linked-y": `${linkedY}px`,
                "--linked-tilt": `${linkedArcTilt}deg`,
                "--linked-delay": `${standingTowerLevel * -95 + wizardIndex * -140}ms`,
                "--wizard-frame-delay": `${wizardIndex * -320}ms`
              }}
              onClick={() => selectable && onPlayTarget(wizard.id)}
              disabled={!selectable}
              title={wizard.name}
            >
              {showsWizardShadow && (
                <img
                  className="wizardShadow"
                  src={spritePath("characters/wizard-shadow")}
                  alt=""
                  aria-hidden="true"
                />
              )}
              <span className="wizardMotion" aria-hidden="true">
                <span className="wizardSprite" />
              </span>
              {debugWizards && debugShowWizardNames && <span>{wizardDebugLabel(game, wizard)}</span>}
            </button>
          );
        })}
      </span>}
      {debugWizards && debugShowWizards && debugShowWizardNames && capturedHere.length > 0 && (
        <span className="capturedWizardRow">
          {capturedHere.map((wizard) => {
            const player = game.players.find((item) => item.id === wizard.playerId);
            const tower = game.towers.find((item) => item.id === wizard.capturedBy);
            return (
              <span
                key={wizard.id}
                className="capturedWizard"
                style={{ background: player.color }}
                title={`${wizard.name} imprisoned in ${tower?.name ?? wizard.capturedBy}`}
              >
                {wizardDebugLabel(game, wizard)}
              </span>
            );
          })}
        </span>
      )}
      {tile.hasRaven && (
        <img
          className="tileRavenSprite"
          src={spritePath("items/raven")}
          alt=""
          aria-hidden="true"
        />
      )}
    </div>
  );
}
