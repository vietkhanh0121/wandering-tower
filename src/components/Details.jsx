import { Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { publicCssUrl, publicPath } from "../lib/assets";
import { WizardFace } from "./WizardFace";

export function Details({ game, activePlayer, localPlayer, isLocalTurn, expression = "idle", onEndTurn, onOpenSettings }) {
  const prevPlayersRef = useRef(null);
  const prevLocalSafeCountRef = useRef(null);
  const [filledPotionIds, setFilledPotionIds] = useState(() => new Set());
  const [safeRingPulse, setSafeRingPulse] = useState(false);
  const fillTimerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const safeRingTimerRef = useRef(null);
  const localWizards = game.wizards.filter((wizard) => wizard.playerId === localPlayer.id);
  const localSafeCount = localWizards.filter((wizard) => wizard.safe).length;

  useEffect(() => {
    const prev = prevPlayersRef.current;
    prevPlayersRef.current = game.players;
    if (!prev) return;
    const ids = new Set();
    game.players.forEach((player) => {
      const prevPlayer = prev.find((p) => p.id === player.id);
      player.potions.forEach((potion) => {
        const prevPotion = prevPlayer?.potions.find((p) => p.id === potion.id);
        if (prevPotion?.state !== "full" && potion.state === "full" && !potion.removed) ids.add(potion.id);
      });
    });
    if (!ids.size) return;
    window.clearTimeout(fillTimerRef.current);
    window.clearTimeout(hideTimerRef.current);
    // Delay ~340ms = TOWER_HOP_DELAY_MS (120) + HOP_MS (220)
    fillTimerRef.current = window.setTimeout(() => {
      setFilledPotionIds(ids);
      hideTimerRef.current = window.setTimeout(() => setFilledPotionIds(new Set()), 800);
    }, 340);
    return () => {
      window.clearTimeout(fillTimerRef.current);
      window.clearTimeout(hideTimerRef.current);
    };
  }, [game.players]);

  useEffect(() => {
    const previous = prevLocalSafeCountRef.current;
    prevLocalSafeCountRef.current = localSafeCount;
    if (previous == null || localSafeCount <= previous) return;
    window.clearTimeout(safeRingTimerRef.current);
    setSafeRingPulse(false);
    window.requestAnimationFrame(() => setSafeRingPulse(true));
    safeRingTimerRef.current = window.setTimeout(() => setSafeRingPulse(false), 900);
    return () => window.clearTimeout(safeRingTimerRef.current);
  }, [localSafeCount]);

  return (
    <section className="infoPanel">
      <div className="infoPanelActions">
        <button
          className={isLocalTurn ? "infoPanelBtn endTurnSimpleBtn active" : "infoPanelBtn endTurnSimpleBtn inactive"}
          disabled={!isLocalTurn}
          onClick={onEndTurn}
        >
          Kết thúc lượt
        </button>
      </div>
      <div
        className={safeRingPulse ? "localAvatarFrame safeRingPulse" : "localAvatarFrame"}
        style={{ "--player-color": localPlayer.color }}
        aria-label={`${localSafeCount}/${localWizards.length} Pháp sư an toàn`}
      >
        <SafeRing total={localWizards.length} safe={localSafeCount} color={localPlayer.color} />
        <span className="localAvatar">
          <WizardFace wizardColor={localPlayer.wizardColor} />
        </span>
        <span className="localSafeBadge" aria-hidden="true">{localSafeCount}/{localWizards.length}</span>
      </div>
      <div className="drawerGrid" style={{ "--player-color": localPlayer.color }}>
        <PlayerLine game={game} player={localPlayer} filledPotionIds={filledPotionIds} variant="local" />
        {onOpenSettings && (
          <button className="infoPanelSettingsBtn" onClick={onOpenSettings} aria-label="Settings">
            <Settings size={15} />
          </button>
        )}
      </div>
    </section>
  );
}

function SafeRing({ total, safe, color }) {
  const count = Math.max(1, total);
  const gap = Math.min(16, 46 / count);
  return (
    <svg className="localAvatarRing" viewBox="0 0 62 62" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => {
        const segment = 360 / count;
        const start = -90 + index * segment + gap / 2;
        const end = -90 + (index + 1) * segment - gap / 2;
        return <path key={`base-${index}`} className="ringSegmentBack" d={arcPath(31, 31, 26, start, end)} />;
      })}
      {Array.from({ length: count }, (_, index) => {
        const segment = 360 / count;
        const start = -90 + index * segment + gap / 2;
        const end = -90 + (index + 1) * segment - gap / 2;
        const isSafe = index < safe;
        return (
          <path
            key={`front-${index}`}
            className={isSafe ? "ringSegment safe" : "ringSegment"}
            d={arcPath(31, 31, 26, start, end)}
            stroke={isSafe ? color : "#6f7a86"}
          />
        );
      })}
    </svg>
  );
}

function arcPath(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(cx, cy, radius, angle) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians)
  };
}

export function OpponentPanel({ game, activePlayerId, localPlayerId = "p1" }) {
  const opponents = orderedOpponentsForLocal(game, localPlayerId);
  if (!opponents.length) return null;
  return (
    <div className={`opponentPanel opponentPanel-${Math.min(2, opponents.length)}`}>
      {opponents.slice(0, 2).map((player) => (
        <PlayerLine key={player.id} game={game} player={player} active={player.id === activePlayerId} variant="opponent" />
      ))}
    </div>
  );
}

function orderedOpponentsForLocal(game, localPlayerId) {
  const turnOrder = game.turnOrder ?? [];
  const localIndex = turnOrder.indexOf(localPlayerId);
  const rankAfterLocal = (playerId) => {
    const index = turnOrder.indexOf(playerId);
    if (index < 0) return 99;
    if (localIndex < 0) return index;
    return (index - localIndex + turnOrder.length) % turnOrder.length;
  };
  return game.players
    .filter((player) => player.id !== localPlayerId)
    .sort((a, b) => rankAfterLocal(a.id) - rankAfterLocal(b.id));
}

function PlayerLine({ game, player, filledPotionIds = new Set(), active = false, variant = "" }) {
  const safe = game.wizards.filter((wizard) => wizard.playerId === player.id && wizard.safe).length;
  const total = game.wizards.filter((wizard) => wizard.playerId === player.id).length;
  return (
    <div
      className={["playerLine", active ? "active" : "", variant ? `playerLine-${variant}` : ""].filter(Boolean).join(" ")}
      style={{
        "--player-color": player.color,
        "--potion-full": publicCssUrl(`assets/sprites/items/potion-${player.wizardColor}.png`),
        background: `${player.color}28`
      }}
    >
      {variant !== "local" && (
        <>
          <img
            className="playerWizardIcon"
            src={publicPath(`assets/sprites/characters/wizard-face/idle_${player.wizardColor}.png`)}
            alt=""
          />
          <span className="playerSafeCount">{safe}/{total}</span>
          {active && <span className="opponentTurnTooltip">Đang đi</span>}
        </>
      )}
      <span className="potions">
        {player.potions.map((potion) => <i key={potion.id} className={[potion.removed ? "removed" : potion.state, filledPotionIds.has(potion.id) ? "justFilled" : ""].filter(Boolean).join(" ")} />)}
      </span>
    </div>
  );
}
