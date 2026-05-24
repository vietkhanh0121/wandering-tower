import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { House, RotateCw, Settings } from "lucide-react";
import { io } from "socket.io-client";
import { Board, SlotMachineOverlay } from "./components/Board";
import { DebugBar } from "./components/DebugBar";
import { Details, OpponentPanel } from "./components/Details";
import { ForbiddenRow } from "./components/ForbiddenRow";
import { Lobby } from "./components/Lobby";
import { PotionStirOverlay } from "./components/PotionStirOverlay";
import {
  PLAYER_PRESETS,
  botPlayStep,
  buildNewGame,
  currentPlayer,
  endTurn,
  legalTargets,
  playSpell,
  replaceSpellbooks,
  resolveFailedSpellAction,
  resolveZeroStepSpell,
  shuffle,
  useForbidden,
  winner
} from "./game/rules";
import { TILE_STEP_Y, TOWER_LEVEL_HEIGHT } from "./game/tower-layout";

const BOOK_DIR = { blue: "book-open_blue", red: "book-open_red", green: "book-open_green", orange: "book-open_orange1" };
const FORBIDDEN_HAND_NOTE = "Dùng Bí thuật sẽ tiêu hao bình thuốc, kể cả khi hiệu ứng không thực hiện được.";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? (import.meta.env.PROD ? window.location.origin : "http://localhost:3001");
import { useForbiddenTargeting } from "./hooks/useForbiddenTargeting";
import { usePieceHopAnimation } from "./hooks/usePieceHopAnimation";
import { publicCssUrl, publicPath } from "./lib/assets";
import { playClick } from "./lib/sounds";
import { PRELOAD_IMAGE_PATHS, preloadImages } from "./lib/preload-assets";
import "./styles.css";
import "./design-system.css";

function OnlineLeaveNotice({ players, game, timedOutPlayers, isHost, onContinueWithBots, onLeaveOnlineRoom }) {
  if (!players.length) return null;
  return (
    <div className="onlineLeaveOverlay" onClick={(event) => event.stopPropagation()}>
      <section className="onlineLeaveNotice" role="status" aria-live="polite">
        <strong className="onlineLeaveTitle">
          <span className="onlineLeaveFaces" aria-hidden="true">
            {players.map((player) => {
              const gamePlayer = game?.players.find((item) => item.id === player.id);
              const wizardColor = gamePlayer?.wizardColor ?? "blue";
              return (
                <img
                  key={player.id}
                  src={publicPath(`assets/sprites/characters/wizard-face/idle_${wizardColor}.png`)}
                  alt=""
                />
              );
            })}
          </span>
          <span>đã rời phòng</span>
        </strong>
        {timedOutPlayers.length > 0 ? (
          isHost ? (
            <>
              <span>Người chơi rời phòng quá lâu. Bạn muốn chơi tiếp với bot?</span>
              <div className="onlineLeaveActions">
                <button type="button" onClick={onContinueWithBots}>Chơi tiếp với Bot</button>
                <button type="button" onClick={onLeaveOnlineRoom}>Về Lobby</button>
              </div>
            </>
          ) : (
            <span>Đang chờ host quyết định.</span>
          )
        ) : (
          <span>Đang chờ người chơi quay lại...</span>
        )}
      </section>
    </div>
  );
}

function App() {
  const [data, setData] = useState(null);
  const [screen, setScreen] = useState("lobby");
  const [showMenu, setShowMenu] = useState(false);
  const [confirmOverlay, setConfirmOverlay] = useState(null);
  const [pendingForbidden, setPendingForbidden] = useState(null);
  const [expandedForbiddenId, setExpandedForbiddenId] = useState(null);
  const [forbiddenHandNote, setForbiddenHandNote] = useState(null);
  const [playerCount, setPlayerCount] = useState(2);
  const [playerColors, setPlayerColors] = useState(null);
  const [game, setGame] = useState(null);
  const latestGameRef = useRef(null);
  const latestScreenRef = useRef(screen);
  const captureStateRef = useRef(null);
  const socketRef = useRef(null);
  const onlineRef = useRef({ roomCode: "", playerId: "" });
  const onlineStartedRoomsRef = useRef(new Set());
  const onlineLeaveRequestedRef = useRef(false);
  const [onlineRoomCode, setOnlineRoomCode] = useState("");
  const [onlinePlayerId, setOnlinePlayerId] = useState("");
  const [onlinePlayers, setOnlinePlayers] = useState([]);
  const [onlineHostId, setOnlineHostId] = useState("");
  const [onlineStatus, setOnlineStatus] = useState("");
  const [onlineConnected, setOnlineConnected] = useState(false);
  const [loadState, setLoadState] = useState({ loaded: 0, total: PRELOAD_IMAGE_PATHS.length, ready: false });
  const [selectedSpellId, setSelectedSpellId] = useState(null);
  const [selectedType, setSelectedType] = useState("wizard");
  const [diceSpellRoll, setDiceSpellRoll] = useState(null);
  const [diceSpellLocked, setDiceSpellLocked] = useState(false);
  const [diceSpellNotice, setDiceSpellNotice] = useState(null);
  const [remoteDiceContext, setRemoteDiceContext] = useState(null);
  const [remoteActionVisual, setRemoteActionVisual] = useState(null);
  const remoteActionTimerRef = useRef(null);
  const [closingSpell, setClosingSpell] = useState(null);
  const [closingBooks, setClosingBooks] = useState([]);
  const [isWaitingForDeal, setIsWaitingForDeal] = useState(false);
  const [spellGuideNote, setSpellGuideNote] = useState(null);
  const [spellGuideArrowX, setSpellGuideArrowX] = useState("50%");
  const forbiddenSpellOverlayRef = useRef(null);
  const [safeSparkles, setSafeSparkles] = useState([]);
  const [forbiddenSparkles, setForbiddenSparkles] = useState([]);
  const [closingForbiddenId, setClosingForbiddenId] = useState(null);
  const forbiddenCardRefs = useRef(new Map());
  const spawnSparkle = (id, rect, scale = 0.75) => {
    const sparkleId = `${id}-${Date.now()}`;
    const size = Math.max(rect.width, rect.height) * scale;
    setSafeSparkles((prev) => [...prev, {
      id: sparkleId,
      left: rect.left + rect.width / 2,
      top: rect.top + rect.height / 2,
      size
    }]);
    window.setTimeout(() => setSafeSparkles((prev) => prev.filter((s) => s.id !== sparkleId)), 520);
  };
  const onSafeRef = useRef(null);
  onSafeRef.current = (entries) => {
    for (const [wizardId, keepTileIndex] of entries) {
      const tileEl = document.querySelector(`[data-tile-index="${keepTileIndex}"]`);
      if (!tileEl) continue;
      const rect = tileEl.getBoundingClientRect();
      spawnSparkle(wizardId, {
        left: rect.left,
        top: rect.top - rect.height * 0.4,
        width: rect.width,
        height: rect.height
      });
    }
  };

  function spawnForbiddenSparkle(spellId, rect) {
    const sparkleId = `${spellId}-${Date.now()}`;
    const size = Math.max(rect.width, rect.height) * 0.216;
    setForbiddenSparkles((prev) => [...prev, {
      id: sparkleId,
      left: rect.left + rect.width / 2,
      top: rect.top + rect.height / 2,
      size
    }]);
    window.setTimeout(() => setForbiddenSparkles((prev) => prev.filter((sparkle) => sparkle.id !== sparkleId)), 520);
  }

  function animateForbiddenUse(spellId, afterClose) {
    const cardRect = forbiddenCardRefs.current.get(spellId)?.getBoundingClientRect();
    if (!cardRect) {
      afterClose();
      return;
    }
    setClosingForbiddenId(spellId);
    window.setTimeout(() => {
      spawnForbiddenSparkle(spellId, cardRect);
      afterClose();
      setClosingForbiddenId((current) => current === spellId ? null : current);
    }, 300);
  }
  const onReleaseRef = useRef(null);
  onReleaseRef.current = (wizardIds) => {
    for (const wizardId of wizardIds) {
      const wizardEl = document.querySelector(`[data-flip-id="${wizardId}"]`);
      if (!wizardEl) continue;
      spawnSparkle(wizardId, wizardEl.getBoundingClientRect(), 0.75);
    }
  };

  const [pendingDealIds, setPendingDealIds] = useState(() => new Set());
  const [wizardExpression, setWizardExpression] = useState("idle");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [debugWizards, setDebugWizards] = useState(false);
  const [soloExpansionMode, setSoloExpansionMode] = useState(false);
  useEffect(() => { document.body.classList.toggle("debug", debugWizards); }, [debugWizards]);
  useEffect(() => {
    const sequence = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
    let index = 0;
    function onKeyDown(event) {
      if (event.key === sequence[index]) {
        index += 1;
        if (index === sequence.length) {
          setDebugWizards((value) => !value);
          index = 0;
        }
        return;
      }
      index = event.key === sequence[0] ? 1 : 0;
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const [debugShowTowers, setDebugShowTowers] = useState(true);
  const [debugShowWizards, setDebugShowWizards] = useState(true);
  const [debugShowTowerNames, setDebugShowTowerNames] = useState(false);
  const [debugShowWizardNames, setDebugShowWizardNames] = useState(false);
  const [debugShowTileNames, setDebugShowTileNames] = useState(false);
  const [debugShowTowerPaths, setDebugShowTowerPaths] = useState(false);
  const [debugShowSlotMachine, setDebugShowSlotMachine] = useState(false);
  const [debugShowPotionMinigame, setDebugShowPotionMinigame] = useState(false);
  const [debugShowWinBanner, setDebugShowWinBanner] = useState(false);
  const [debugShowLoseBanner, setDebugShowLoseBanner] = useState(false);
  const [debugShowDiceOverlay, setDebugShowDiceOverlay] = useState(false);
  const [debugTileStepY, setDebugTileStepY] = useState(TILE_STEP_Y);
  const [debugTowerStackStep, setDebugTowerStackStep] = useState(TOWER_LEVEL_HEIGHT);
  const [expandedStackIndex, setExpandedStackIndex] = useState(null);
  const previousHandsRef = useRef(new Map());
  const previousSpellRectsRef = useRef(new Map());
  const spellCardRefs = useRef(new Map());
  const clickedSelectedSpellRef = useRef(null);
  const suppressSpellClickRef = useRef(false);
  const recentlyDrawnIdsRef = useRef(new Set());
  const spellFlipAnimsRef = useRef(new Map());
  const drawAnimationTimersRef = useRef([]);
  const dealRevealTimerRef = useRef(null);
  const [drawAnimationIds, setDrawAnimationIds] = useState(() => new Set());
  const effectTimersRef = useRef([]);
  const layoutOptions = useMemo(() => ({
    tileStepY: debugTileStepY,
    towerLevelHeight: debugTowerStackStep
  }), [debugTileStepY, debugTowerStackStep]);
  const { captureState, towerJumpPaths, hiddenShadowTileIndexes, lingeringCapturedWizardIds, lingeringSafeWizards, isAnimatingPieces } = usePieceHopAnimation(game, layoutOptions, {
    onSafe: (entries) => onSafeRef.current?.(entries),
    onRelease: (wizardIds) => onReleaseRef.current?.(wizardIds)
  });

  useEffect(() => {
    latestGameRef.current = game;
    latestScreenRef.current = screen;
    captureStateRef.current = captureState;
  }, [game, screen, captureState]);

  const [imprisoningTowerIds, setImprisoningTowerIds] = useState(() => new Set());
  const prevGameForCaptureRef = useRef(null);
  useEffect(() => {
    if (!game) { prevGameForCaptureRef.current = null; return; }
    const prev = prevGameForCaptureRef.current;
    prevGameForCaptureRef.current = game;
    if (!prev) return;
    const ids = new Set();
    game.wizards.forEach((w) => {
      if (!w.capturedBy) return;
      const prevW = prev.wizards.find((p) => p.id === w.id);
      if (!prevW?.capturedBy) ids.add(w.capturedBy);
    });
    if (!ids.size) return;
    setImprisoningTowerIds(ids);
    const t = window.setTimeout(() => setImprisoningTowerIds(new Set()), 700);
    return () => window.clearTimeout(t);
  }, [game]);

  useEffect(() => {
    let cancelled = false;
    const loadJson = (path) => fetch(`${publicPath(path)}?v=${Date.now()}`, { cache: "no-store" }).then((response) => response.json());

    Promise.all([
      Promise.all([
        loadJson("data/tiles.json"),
        loadJson("data/forbidden-spells.json"),
        loadJson("data/spellbooks.json")
      ]),
      preloadImages(PRELOAD_IMAGE_PATHS, (progress) => {
        if (!cancelled) setLoadState({ ...progress, ready: false });
      })
    ]).then(([[tiles, forbiddenSpells, spellbooks]]) => {
      if (cancelled) return;
      setData({ tiles, forbiddenSpells, spellbooks: sanitizeSpellbooks(spellbooks) });
      setLoadState({ loaded: PRELOAD_IMAGE_PATHS.length, total: PRELOAD_IMAGE_PATHS.length, ready: true });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    onlineRef.current = { roomCode: onlineRoomCode, playerId: onlinePlayerId };
  }, [onlineRoomCode, onlinePlayerId]);

  useEffect(() => () => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    window.clearTimeout(remoteActionTimerRef.current);
  }, []);

  function getSocket() {
    if (socketRef.current) return socketRef.current;
    const socket = io(SOCKET_URL, { autoConnect: true });
    socket.on("connect", () => {
      setOnlineConnected(true);
      setOnlineStatus("Đã kết nối server local.");
    });
    socket.on("disconnect", () => {
      setOnlineConnected(false);
      setOnlineStatus("Mất kết nối server local.");
    });
    socket.on("connect_error", () => {
      setOnlineConnected(false);
      setOnlineStatus("Chưa kết nối được Socket.IO server. Hãy chạy npm run socket.");
    });
    socket.on("room-state", (room) => {
      setOnlineRoomCode(room.code);
      setOnlinePlayers(room.players ?? []);
      setOnlineHostId(room.hostId ?? "");
      if (room.playerCount) setPlayerCount(room.playerCount);
      if (room.game) {
        const currentGame = latestGameRef.current;
        if (currentGame && isSameSyncedGame(currentGame, room.game)) {
          setPlayerColors(room.game.players.map(({ id, name, color, wizardColor }) => ({ id, name, color, wizardColor })));
          setScreen("game");
          return;
        }
        const shouldAnimateRemoteState = room.lastEvent !== "reset-game" && room.lastEvent !== "start-game";
        if (shouldAnimateRemoteState && currentGame && latestScreenRef.current === "game") {
          captureStateRef.current?.(currentGame);
        }
        if (room.lastActorId && room.lastActorId !== onlineRef.current.playerId) {
          setRemoteDiceContext((current) => current?.playerId === room.lastActorId ? null : current);
        }
        setGame(room.game);
        setPlayerColors(room.game.players.map(({ id, name, color, wizardColor }) => ({ id, name, color, wizardColor })));
        setScreen("game");
      } else if (room.code) {
        const readyCount = (room.players ?? []).filter((player) => player.connected || player.bot).length;
        const neededCount = room.playerCount ?? 2;
        const missingTimedOut = (room.players ?? []).some((player) => !player.connected && !player.bot && player.timedOut);
        setOnlineStatus(missingTimedOut
          ? "Người chơi đã rời phòng."
          : readyCount >= neededCount
          ? "Đủ người chơi. Đang bắt đầu..."
          : `Đang chờ người chơi ${readyCount}/${neededCount}.`);
      }
    });
    socket.on("dice-roll", ({ playerId, roll }) => {
      if (!roll || playerId === onlineRef.current.playerId) return;
      showRemoteDiceRoll(playerId, roll);
    });
    socket.on("remote-action", ({ playerId, action }) => {
      if (!action || playerId === onlineRef.current.playerId) return;
      showRemoteActionVisual(playerId, action);
    });
    socketRef.current = socket;
    return socket;
  }

  function commitGame(nextGame, actorPlayerId = onlineRef.current.playerId) {
    setGame(nextGame);
    const { roomCode } = onlineRef.current;
    if (!roomCode || !actorPlayerId) return;
    socketRef.current?.emit("update-game", { roomCode, playerId: actorPlayerId, game: nextGame });
  }

  function isSameSyncedGame(a, b) {
    if (!a || !b) return false;
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function showRemoteDiceRoll(playerId, roll) {
    const player = latestGameRef.current?.players.find((item) => item.id === playerId);
    setRemoteActionVisual(null);
    setRemoteDiceContext({
      playerId,
      type: roll.type,
      diceRolls: roll.diceRolls,
      playerName: player?.name ?? playerId.toUpperCase(),
      wizardColor: player?.wizardColor ?? "blue",
      forcedRoll: {
        id: `${playerId}-${roll.rollCount}-${roll.face}-${Date.now()}`,
        face: roll.face,
        rollCount: roll.rollCount
      }
    });
  }

  function showRemoteActionVisual(playerId, action) {
    const player = latestGameRef.current?.players.find((item) => item.id === playerId);
    window.clearTimeout(remoteActionTimerRef.current);
    setRemoteDiceContext((current) => current?.playerId === playerId ? null : current);
    setRemoteActionVisual({
      ...action,
      playerId,
      playerColor: player?.color,
      wizardColor: player?.wizardColor ?? "blue"
    });
    remoteActionTimerRef.current = window.setTimeout(() => {
      setRemoteActionVisual(null);
    }, 2600);
  }

  function showSoloBotRemoteMessage(botAction) {
    if (!botAction?.playerId || !botAction.action) return;
    setRemoteDiceContext(null);
    showRemoteActionVisual(botAction.playerId, botAction.action);
  }

  function emitRemoteAction(action) {
    if (!onlineRoomCode || !onlinePlayerId || !action) return;
    socketRef.current?.emit("remote-action", {
      roomCode: onlineRoomCode,
      playerId: onlinePlayerId,
      action
    });
  }

  useEffect(() => {
    function onPointerDown(e) {
      const interactive = e.target.closest("button, [data-bounce]");
      if (interactive && soundEnabled) playClick();
      const bounceEl = e.target.closest("[data-bounce]");
      if (!bounceEl) return;
      bounceEl.classList.remove("tapping");
      void bounceEl.offsetWidth;
      bounceEl.classList.add("tapping");
    }
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [soundEnabled]);

  function startFromLobby(count, options = {}) {
    if (!data) return;
    setOnlineRoomCode("");
    setOnlinePlayerId("");
    setOnlinePlayers([]);
    setOnlineHostId("");
    setOnlineStatus("");
    onlineStartedRoomsRef.current.clear();
    const shuffledVisuals = shuffle([...PLAYER_PRESETS]);
    const presets = PLAYER_PRESETS.map((preset, i) => ({ ...shuffledVisuals[i], id: preset.id }));
    setPlayerColors(presets);
    setPlayerCount(count);
    setGame(buildNewGame({ ...data, playerCount: count, playerPresets: presets, expansionMode: Boolean(options.expansionMode) }));
    setSelectedSpellId(null);
    setIsWaitingForDeal(false);
    setScreen("game");
  }

  function leaveOnlineRoom() {
    setConfirmOverlay(null);
    onlineLeaveRequestedRef.current = true;
    socketRef.current?.emit("leave-room", { roomCode: onlineRoomCode });
    setScreen("lobby");
    setGame(null);
    setOnlineRoomCode("");
    setOnlinePlayerId("");
    setOnlinePlayers([]);
    setOnlineHostId("");
    setOnlineStatus("");
    setRemoteDiceContext(null);
    setRemoteActionVisual(null);
    setSelectedSpellId(null);
    setDiceSpellRoll(null);
    setDiceSpellLocked(false);
  }

  function continueOnlineWithBots() {
    if (!onlineRoomCode || !isOnlineHost) return;
    socketRef.current?.emit("continue-with-bots", { roomCode: onlineRoomCode }, (response) => {
      if (!response?.ok) setOnlineStatus("Không thể chuyển người rời phòng thành bot.");
    });
  }

  function newGame() {
    setConfirmOverlay(null);
    if (!data || !playerColors) return;
    const isOnlineHost = onlineRoomCode && onlineHostId && socketRef.current?.id === onlineHostId;
    if (onlineRoomCode && !isOnlineHost) {
      setOnlineStatus("Chỉ host có thể tạo ván mới trong phòng online.");
      return;
    }
    const nextGame = buildNewGame({ ...data, playerCount, playerPresets: playerColors, expansionMode: Boolean(game?.expansionMode) });
    setGame(nextGame);
    if (onlineRoomCode && isOnlineHost) {
      socketRef.current?.emit("reset-game", { roomCode: onlineRoomCode, game: nextGame });
    }
    setSelectedSpellId(null);
    setIsWaitingForDeal(false);
  }

  function requestLeaveLobbyConfirm() {
    setShowMenu(false);
    setConfirmOverlay({
      type: "lobby",
      title: "Bạn có muốn về Lobby?",
      restoreMenuOnCancel: true,
      onConfirm: leaveOnlineRoom
    });
  }

  function requestNewGameConfirm({ restoreMenuOnCancel = false } = {}) {
    setShowMenu(false);
    setConfirmOverlay({
      type: "new-game",
      title: "Bạn có muốn tạo Ván mới?",
      restoreMenuOnCancel,
      onConfirm: newGame
    });
  }

  function cancelConfirmOverlay() {
    const shouldRestoreMenu = confirmOverlay?.restoreMenuOnCancel;
    setConfirmOverlay(null);
    if (shouldRestoreMenu) setShowMenu(true);
  }

  function startOnlineRoom(count = 2) {
    if (!data) return;
    const socket = getSocket();
    onlineLeaveRequestedRef.current = false;
    setOnlineStatus("Đang tạo phòng...");
    socket.emit("create-room", { playerCount: count }, (response) => {
      if (!response?.ok) {
        setOnlineStatus(response?.message ?? "Không tạo được phòng.");
        return;
      }
      if (onlineLeaveRequestedRef.current) {
        socket.emit("leave-room", { roomCode: response.room?.code });
        return;
      }
      setOnlineRoomCode(response.room.code);
      setOnlinePlayerId(response.playerId);
      setOnlinePlayers(response.room.players ?? []);
      setOnlineHostId(response.room.hostId ?? "");
      setPlayerCount(count);
      setGame(null);
      setSelectedSpellId(null);
      setIsWaitingForDeal(false);
      setOnlineStatus(`Phòng ${response.room.code} đã sẵn sàng. Đang chờ 1/${count}.`);
    });
  }

  function joinOnlineRoom(roomCode) {
    const code = String(roomCode || "").trim().toUpperCase();
    if (!code) {
      setOnlineStatus("Nhập mã phòng trước đã.");
      return;
    }
    const socket = getSocket();
    onlineLeaveRequestedRef.current = false;
    setOnlineStatus("Đang vào phòng...");
    socket.emit("join-room", { roomCode: code }, (response) => {
      if (!response?.ok) {
        setOnlineStatus(response?.message ?? "Không vào được phòng.");
        return;
      }
      if (onlineLeaveRequestedRef.current) {
        socket.emit("leave-room", { roomCode: response.room?.code });
        return;
      }
      setOnlineRoomCode(response.room.code);
      setOnlinePlayerId(response.playerId);
      setOnlinePlayers(response.room.players ?? []);
      setOnlineHostId(response.room.hostId ?? "");
      if (response.room.playerCount) setPlayerCount(response.room.playerCount);
      if (response.room.game) {
        setGame(response.room.game);
        setPlayerColors(response.room.game.players.map(({ id, name, color, wizardColor }) => ({ id, name, color, wizardColor })));
        setSelectedSpellId(null);
        setIsWaitingForDeal(false);
        setScreen("game");
      }
      const connectedCount = (response.room.players ?? []).filter((player) => player.connected).length;
      const neededCount = response.room.playerCount ?? 2;
      setOnlineStatus(response.room.game ? `Đã vào phòng ${response.room.code}.` : `Đã vào phòng ${response.room.code}. Đang chờ ${connectedCount}/${neededCount}.`);
    });
  }

  useEffect(() => {
    const isOnlineHost = onlineHostId && socketRef.current?.id === onlineHostId;
    if (!data || !onlineRoomCode || !isOnlineHost || game) return;
    const readyCount = onlinePlayers.filter((player) => player.connected || player.bot).length;
    if (readyCount < playerCount) return;
    if (onlineStartedRoomsRef.current.has(onlineRoomCode)) return;
    onlineStartedRoomsRef.current.add(onlineRoomCode);
    const presets = PLAYER_PRESETS.slice(0, playerCount);
    const nextGame = buildNewGame({ ...data, playerCount, playerPresets: presets });
    setPlayerColors(presets);
    setSelectedSpellId(null);
    setIsWaitingForDeal(false);
    setOnlineStatus("Đủ người chơi. Bắt đầu ván...");
    setGame(nextGame);
    setScreen("game");
    socketRef.current?.emit("start-game", { roomCode: onlineRoomCode, playerCount, game: nextGame });
  }, [data, onlineRoomCode, onlineHostId, onlinePlayers, playerCount, game]);

  const activePlayer = game ? currentPlayer(game) : null;
  const isOnlineGame = Boolean(onlineRoomCode && onlinePlayerId);
  const isOnlineHost = isOnlineGame && onlineHostId && socketRef.current?.id === onlineHostId;
  const localPlayerId = isOnlineGame ? onlinePlayerId : "p1";
  const isBotTurn = activePlayer !== null && activePlayer.id !== localPlayerId;
  const localPlayer = game?.players.find((player) => player.id === localPlayerId) ?? activePlayer;
  const visibleHandPlayer = isBotTurn ? localPlayer : activePlayer;
  const bookDir = BOOK_DIR[visibleHandPlayer?.wizardColor] ?? "book-open";
  const bookVars = Object.fromEntries(
    Array.from({ length: 8 }, (_, i) => [`--book-f${i + 1}`, publicCssUrl(`assets/sprites/items/${bookDir}/frame-${i + 1}.png`)])
  );
  const selectedSpell = visibleHandPlayer?.hand.find((spell) => spell.id === selectedSpellId);
  const availableActions = selectedSpell?.pages.map((page) => page.type) ?? [];
  const selectedPage = selectedSpell?.pages.find((page) => page.type === selectedType);
  const selectedSpellGuide = selectedPage
    ? selectedPage.diceRolls
      ? `Tung xúc xắc để di chuyển 1 ${selectedPage.type === "tower" ? "Tháp" : "Pháp sư"}`
      : `Di chuyển 1 ${selectedPage.type === "tower" ? "Tháp" : "Pháp sư"} tiến ${selectedPage.value + (visibleHandPlayer?.bonusStep ?? 0)} bước`
    : "";
  const isDiceBookLocked = Boolean(selectedPage?.diceRolls && diceSpellLocked);
  const diceBookLockedGuide = selectedPage
    ? diceSpellRoll
      ? `Chọn ${selectedPage.type === "tower" ? "Tháp" : "Pháp sư"} để di chuyển hoặc Tung lại nếu còn lượt.`
      : "Đợi xúc xắc dừng trước khi chọn mục tiêu."
    : "";
  const activeSpellGuide = spellGuideNote?.spellId === selectedSpellId ? spellGuideNote.message : selectedSpellGuide;
  const activeWinner = game ? winner(game) : null;
  const pendingWinnerInfo = activeWinner || (debugShowWinBanner ? { id: "debug-win", name: "Người chơi" } : debugShowLoseBanner ? { id: "debug-lose", name: "Đối thủ" } : null);
  const visibleWinnerInfo = pendingWinnerInfo && !isAnimatingPieces ? pendingWinnerInfo : null;
  const isResultVisible = Boolean(visibleWinnerInfo);
  const localFullPotions = localPlayer?.potions.filter((p) => p.state === "full" && !p.removed).length ?? 0;
  const missingOnlinePlayers = isOnlineGame
    ? onlinePlayers.filter((player) => !player.connected && !player.bot)
    : [];
  const timedOutMissingPlayers = missingOnlinePlayers.filter((player) => player.timedOut);

  useLayoutEffect(() => {
    if (!selectedSpellId || !selectedType) {
      setSpellGuideArrowX("50%");
      return undefined;
    }

    function updateSpellGuideArrow() {
      const overlay = forbiddenSpellOverlayRef.current;
      const card = spellCardRefs.current.get(selectedSpellId);
      const page = card?.querySelector?.(`.spellPage[data-page-type="${selectedType}"]`);
      const guide = overlay?.querySelector?.(".spellGuide");
      const target = page?.classList.contains("single")
        ? page.querySelector(".spellPageFace:not(.blank)") ?? page
        : page ?? card;
      if (!guide || !target) {
        setSpellGuideArrowX("50%");
        return;
      }
      const guideRect = guide.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const centerX = targetRect.left + targetRect.width / 2 - guideRect.left;
      setSpellGuideArrowX(`${Math.round(centerX)}px`);
    }

    updateSpellGuideArrow();
    window.addEventListener("resize", updateSpellGuideArrow);
    return () => window.removeEventListener("resize", updateSpellGuideArrow);
  }, [selectedSpellId, selectedType, visibleHandPlayer?.hand.length, activeSpellGuide]);

  const [displayedPlayerId, setDisplayedPlayerId] = useState(null);
  useEffect(() => {
    if (!game) { setDisplayedPlayerId(null); return; }
    if (!isAnimatingPieces) setDisplayedPlayerId(game.turnOrder[game.currentPlayerIndex]);
  }, [isAnimatingPieces, game]);

  useEffect(() => {
    if (!game?.mistVeil?.expiring || isAnimatingPieces) return;
    setGame((current) => {
      if (!current?.mistVeil?.expiring) return current;
      const next = { ...current };
      delete next.mistVeil;
      return next;
    });
  }, [game?.mistVeil?.expiring, isAnimatingPieces]);

  const displayedActivePlayer = (displayedPlayerId && game?.players.find((p) => p.id === displayedPlayerId)) ?? activePlayer;
  const displayedIsLocalTurn = displayedActivePlayer?.id === localPlayerId;

  const forbiddenPotionSprite = publicPath(`assets/sprites/items/potion-${localPlayer?.wizardColor ?? "blue"}.png`);
  const selectableIds = useMemo(() => {
    if (!game || !selectedSpell || isBotTurn) return new Set();
    if (!availableActions.includes(selectedType)) return new Set();
    return new Set(legalTargets(game, activePlayer.id, selectedType).map((target) => target.id));
  }, [activePlayer?.id, availableActions.join(","), game, isBotTurn, selectedSpell, selectedType]);

  const {
    effectiveSelectableIds,
    effectiveSelectedType,
    highlightedTileIds,
    resolveTileToTopTower
  } = useForbiddenTargeting({ game, pendingForbidden, selectableIds, selectedType });

  function handleForbiddenDeselect() {
    if ((pendingForbidden?.targetType === "tile" || pendingForbidden?.targetType === "wizard-swap") && pendingForbidden.firstTarget != null) {
      setPendingForbidden({ ...pendingForbidden, firstTarget: null });
    }
  }

  function handleForbiddenTarget(targetId) {
    if (!pendingForbidden) return;
    const { spellId, targetType, firstTarget } = pendingForbidden;
    if (pendingForbidden.diceRolls && diceSpellRoll?.value == null) {
      setForbiddenHandNote("Hãy tung xúc xắc trước khi chọn mục tiêu.");
      return;
    }
    if ((targetType === "tile" || targetType === "wizard-swap") && firstTarget == null) {
      setPendingForbidden({ ...pendingForbidden, firstTarget: targetId });
      return;
    }
    const resolvedId = targetType === "tile" ? resolveTileToTopTower(firstTarget) : targetType === "wizard-swap" ? firstTarget : targetId;
    const resolvedId2 = targetType === "tile" ? resolveTileToTopTower(targetId) : targetType === "wizard-swap" ? targetId : null;
    const options = { free: debugWizards, targetId: resolvedId, targetId2: resolvedId2, valueOverride: pendingForbidden.diceRolls ? diceSpellRoll.value : null };
    animateForbiddenUse(spellId, () => {
      captureState();
      const spell = game.forbidden.find((item) => item.id === spellId) ?? data?.forbiddenSpells?.find((item) => item.id === spellId);
      emitRemoteAction({ kind: "forbidden", spell });
      commitGame(useForbidden(game, spellId, options));
      setPendingForbidden(null);
      setForbiddenHandNote(null);
      setExpandedForbiddenId(null);
      setExpandedStackIndex(null);
      setDebugShowDiceOverlay(false);
      setDiceSpellRoll(null);
      setDiceSpellLocked(false);
      setDiceSpellNotice(null);
    });
  }

  function useForbiddenCard(spell) {
    if (isBotTurn) return;
    if (pendingForbidden?.spellId === spell.id) {
      setExpandedForbiddenId(spell.id);
      return;
    }
    if (pendingForbidden) {
      setPendingForbidden(null);
      setForbiddenHandNote(null);
      setDebugShowDiceOverlay(false);
      setDiceSpellRoll(null);
      setDiceSpellLocked(false);
      setDiceSpellNotice(null);
    }
    setExpandedStackIndex(null);
    setSelectedSpellId(null);
    setSpellGuideNote(null);
    setDebugShowDiceOverlay(false);
    setDiceSpellRoll(null);
    setDiceSpellLocked(false);
    setDiceSpellNotice(null);
    if (!spell.targeting || spell.targeting === "auto") {
      if (!debugWizards) {
        const activeId = game.turnOrder[game.currentPlayerIndex];
        const fullCount = game.players.find((p) => p.id === activeId)?.potions.filter((p) => p.state === "full" && !p.removed).length ?? 0;
        if (fullCount < spell.potionCost) {
          setExpandedForbiddenId(spell.id);
          setForbiddenHandNote("Chưa đủ bình thuốc đầy để dùng Bí thuật này.");
          commitGame(useForbidden(game, spell.id, { free: false }));
          return;
        }
      }
      animateForbiddenUse(spell.id, () => {
        captureState();
        emitRemoteAction({ kind: "forbidden", spell });
        commitGame(useForbidden(game, spell.id, { free: debugWizards }));
        setForbiddenHandNote(null);
        setExpandedForbiddenId(null);
      });
      return;
    }
    if (!debugWizards) {
      const activeId = game.turnOrder[game.currentPlayerIndex];
      const fullCount = game.players.find((p) => p.id === activeId)?.potions.filter((p) => p.state === "full" && !p.removed).length ?? 0;
      if (fullCount < spell.potionCost) {
        setExpandedForbiddenId(spell.id);
        setForbiddenHandNote("Chưa đủ bình thuốc đầy để dùng Bí thuật này.");
        commitGame(useForbidden(game, spell.id, { free: false }));
        return;
      }
    }
    setExpandedForbiddenId(spell.id);
    setForbiddenHandNote(null);
    setDiceSpellRoll(null);
    setDiceSpellLocked(false);
    setDiceSpellNotice(null);
    setDebugShowDiceOverlay(Boolean(spell.diceRolls && !isBotTurn));
    setPendingForbidden({ spellId: spell.id, targetType: spell.targeting, firstTarget: null, diceRolls: spell.diceRolls ?? null });
  }

  useLayoutEffect(() => {
    if (!visibleHandPlayer || isWaitingForDeal) return;
    const handIds = visibleHandPlayer.hand.map((spell) => spell.id);
    const previousHandIds = previousHandsRef.current.get(visibleHandPlayer.id);
    const nextHandIds = new Set(handIds);

    if (previousHandIds) {
      const newlyDrawnIds = handIds.filter((id) => !previousHandIds.has(id));
      if (newlyDrawnIds.length) {
        newlyDrawnIds.forEach((id) => recentlyDrawnIdsRef.current.add(id));
        setDrawAnimationIds((current) => new Set([...current, ...newlyDrawnIds]));
        const timer = window.setTimeout(() => {
          setDrawAnimationIds((current) => {
            const next = new Set(current);
            newlyDrawnIds.forEach((id) => next.delete(id));
            return next;
          });
        }, 1070);
        const cleanupTimer = window.setTimeout(() => {
          newlyDrawnIds.forEach((id) => recentlyDrawnIdsRef.current.delete(id));
        }, 1350);
        drawAnimationTimersRef.current.push(timer);
        drawAnimationTimersRef.current.push(cleanupTimer);
      }
    }

    previousHandsRef.current.set(visibleHandPlayer.id, nextHandIds);
  }, [visibleHandPlayer?.id, visibleHandPlayer?.hand.map((spell) => spell.id).join(","), isWaitingForDeal]);

  useEffect(() => () => {
    drawAnimationTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    effectTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    window.clearTimeout(dealRevealTimerRef.current);
  }, []);

  useEffect(() => {
    const isOnlineBotTurn = isOnlineGame && isOnlineHost && onlinePlayers.some((player) => player.id === activePlayer?.id && player.bot);
    const isOfflineBotTurn = !isOnlineGame && isBotTurn;
    if (!game || !activePlayer || (!isOfflineBotTurn && !isOnlineBotTurn) || closingSpell || isWaitingForDeal || isAnimatingPieces || activeWinner) return;
    const timer = window.setTimeout(() => {
      captureState();
      setSelectedSpellId(null);
      setExpandedStackIndex(null);
      const nextGame = botPlayStep(game);
      if (!isOnlineGame && nextGame.lastBotAction) showSoloBotRemoteMessage(nextGame.lastBotAction);
      if (isOnlineBotTurn) {
        commitGame(nextGame, activePlayer.id);
      } else {
        setGame(nextGame);
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [activePlayer?.id, game, isBotTurn, isOnlineGame, isOnlineHost, onlinePlayers, closingSpell, isWaitingForDeal, isAnimatingPieces, activeWinner]);

  useLayoutEffect(() => {
    if (!visibleHandPlayer) return;
    const nextRects = new Map();

    visibleHandPlayer.hand.forEach((spell) => {
      const element = spellCardRefs.current.get(spell.id);
      if (!element) return;

      const existingFlip = spellFlipAnimsRef.current.get(spell.id);
      if (existingFlip && existingFlip.playState !== "finished") existingFlip.finish();

      const rect = element.getBoundingClientRect();
      const previousRect = previousSpellRectsRef.current.get(spell.id);
      nextRects.set(spell.id, rect);

      if (!previousRect || drawAnimationIds.has(spell.id) || recentlyDrawnIdsRef.current.has(spell.id)) return;
      const deltaX = previousRect.left - rect.left;
      const deltaY = previousRect.top - rect.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;

      const anim = element.animate([
        { transform: `translate(${deltaX}px, ${deltaY}px)` },
        { transform: "translate(0, 0)" }
      ], {
        duration: 280,
        easing: "ease-out",
        fill: "both"
      });
      spellFlipAnimsRef.current.set(spell.id, anim);
    });

    previousSpellRectsRef.current = nextRects;
  }, [visibleHandPlayer?.id, visibleHandPlayer?.hand.map((spell) => spell.id).join(","), drawAnimationIds]);

  function chooseSpell(spell, type = spell.pages[0]?.type) {
    if (suppressSpellClickRef.current) {
      suppressSpellClickRef.current = false;
      clickedSelectedSpellRef.current = null;
      return;
    }
    if (pendingForbidden) {
      setPendingForbidden(null);
      setForbiddenHandNote(null);
      setDebugShowDiceOverlay(false);
      setDiceSpellRoll(null);
      setDiceSpellLocked(false);
      setDiceSpellNotice(null);
    }
    if (isDiceBookLocked) {
      setSpellGuideNote({
        spellId: selectedSpellId,
        message: diceBookLockedGuide
      });
      return;
    }
    const normalizedType = spell.pages.length === 1 ? spell.pages[0]?.type : type;
    if (!normalizedType || !spell.pages.some((page) => page.type === normalizedType)) return;
    const clickedSelectedSpell = clickedSelectedSpellRef.current;
    const shouldDeselect = selectedSpellId === spell.id && (
      spell.pages.length === 1 ||
      selectedType === normalizedType ||
      (clickedSelectedSpell?.spellId === spell.id && clickedSelectedSpell?.type === normalizedType && selectedType === normalizedType)
    );
    clickedSelectedSpellRef.current = null;
    if (shouldDeselect) {
      setSelectedSpellId(null);
      setDebugShowDiceOverlay(false);
      setDiceSpellRoll(null);
      setDiceSpellLocked(false);
      setDiceSpellNotice(null);
      setExpandedStackIndex(null);
      setSpellGuideNote(null);
      return;
    }
    const selectedPageForType = spell.pages.find((page) => page.type === normalizedType);
    setSelectedSpellId(spell.id);
    setSelectedType(normalizedType);
    setDebugShowDiceOverlay(Boolean(selectedPageForType?.diceRolls && !isBotTurn));
    setDiceSpellRoll(null);
    setDiceSpellLocked(false);
    setDiceSpellNotice(null);
    setExpandedStackIndex(null);
    setSpellGuideNote(null);
    if (!isBotTurn && selectedPageForType?.diceRolls && legalTargets(game, activePlayer.id, normalizedType).length === 0) {
      setDiceSpellLocked(false);
      setDiceSpellNotice("Không thể thực hiện nước đi");
      setSpellGuideNote({
        spellId: spell.id,
        message: "Không thể thực hiện nước đi"
      });
    }
  }

  function playDirect(targetId) {
    if (!game || !selectedSpellId || isBotTurn || closingSpell || !selectableIds.has(targetId)) return;
    const spellId = selectedSpellId;
    const type = selectedType;
    const spellPage = selectedSpell?.pages.find((page) => page.type === type);
    const diceValue = spellPage?.diceRolls ? diceSpellRoll?.value : null;
    if (spellPage?.diceRolls && diceValue == null) {
      setSpellGuideNote({
        spellId,
        message: "Hãy tung xúc xắc trước khi chọn mục tiêu."
      });
      return;
    }
    const resolveSpell = () => {
      const nextGame = playSpell(game, spellId, { type, targetId, valueOverride: diceValue ?? undefined });
      if (nextGame.actionRejected) {
        if (spellPage?.diceRolls) {
          const failedGame = resolveFailedSpellAction(game, spellId, "Không thể thực hiện nước đi");
          setSpellGuideNote(null);
          startSpellbookCloseEffect(spellId, type);
          captureState();
          commitGame(failedGame);
          setSelectedSpellId(null);
          setDiceSpellRoll(null);
          setDiceSpellLocked(false);
          setDiceSpellNotice(null);
          setDebugShowDiceOverlay(false);
          return;
        }
        setGame(nextGame);
        setSpellGuideNote({
          spellId,
          message: "Không thể thực hiện nước đi"
        });
        return;
      }
      setSpellGuideNote(null);
      if (!spellPage?.diceRolls) {
        emitRemoteAction({
          kind: "spell",
          spell: selectedSpell,
          pageType: type
        });
      }
      startSpellbookCloseEffect(spellId, type);
      captureState();
      if (nextGame.currentPlayerIndex !== game.currentPlayerIndex) {
        window.clearTimeout(dealRevealTimerRef.current);
        const nextP1 = nextGame.players.find((p) => p.id === localPlayer.id);
        const prevHandIds = previousHandsRef.current.get(localPlayer.id) ?? new Set();
        const incomingIds = nextP1 ? nextP1.hand.map((s) => s.id).filter((id) => !prevHandIds.has(id)) : [];
        setIsWaitingForDeal(true);
        setPendingDealIds(new Set(incomingIds));
        dealRevealTimerRef.current = window.setTimeout(() => {
          if (nextP1) previousHandsRef.current.set(localPlayer.id, new Set(nextP1.hand.map((s) => s.id)));
          setPendingDealIds(new Set());
          if (incomingIds.length) {
            incomingIds.forEach((id) => recentlyDrawnIdsRef.current.add(id));
            setDrawAnimationIds((current) => new Set([...current, ...incomingIds]));
            const t1 = window.setTimeout(() => {
              setDrawAnimationIds((current) => {
                const next = new Set(current);
                incomingIds.forEach((id) => next.delete(id));
                return next;
              });
            }, 1070);
            const t2 = window.setTimeout(() => {
              incomingIds.forEach((id) => recentlyDrawnIdsRef.current.delete(id));
            }, 1350);
            drawAnimationTimersRef.current.push(t1, t2);
          }
          setIsWaitingForDeal(false);
        }, 325);
      }
      commitGame(nextGame);
      setSelectedSpellId(null);
      setDiceSpellRoll(null);
      setDiceSpellLocked(false);
      setDiceSpellNotice(null);
      setDebugShowDiceOverlay(false);
      setSpellGuideNote(null);
    };
    if (expandedStackIndex != null) {
      setExpandedStackIndex(null);
      window.setTimeout(() => {
        resolveSpell();
      }, 270);
      return;
    }
    resolveSpell();
  }

  function clearSelectedSpell() {
    if (isDiceBookLocked) {
      setSpellGuideNote({
        spellId: selectedSpellId,
        message: diceBookLockedGuide
      });
      return;
    }
    setSelectedSpellId(null);
    setExpandedStackIndex(null);
    setDiceSpellRoll(null);
    setDiceSpellLocked(false);
    setDiceSpellNotice(null);
    setDebugShowDiceOverlay(false);
    setSpellGuideNote(null);
  }

  function resolveZeroDiceSpell({ spellId, type }) {
    if (!game || !spellId || !type) return;
    const nextGame = resolveZeroStepSpell(game, spellId, type);
    setSpellGuideNote(null);
    startSpellbookCloseEffect(spellId, type);
    captureState();
    commitGame(nextGame);
    setSelectedSpellId(null);
    setDiceSpellRoll(null);
    setDiceSpellLocked(false);
    setDiceSpellNotice(null);
    setDebugShowDiceOverlay(false);
  }

  function resolveFailedDiceSpell({ spellId }) {
    if (!game || !spellId) return;
    const type = selectedType;
    const nextGame = resolveFailedSpellAction(game, spellId, "Không thể thực hiện nước đi");
    setSpellGuideNote(null);
    startSpellbookCloseEffect(spellId, type);
    captureState();
    commitGame(nextGame);
    setSelectedSpellId(null);
    setDiceSpellRoll(null);
    setDiceSpellLocked(false);
    setDiceSpellNotice(null);
    setDebugShowDiceOverlay(false);
  }

  function handleDiceRollStart(roll) {
    if (!pendingForbidden?.diceRolls && (!selectedSpellId || !selectedPage?.diceRolls)) return;
    setDiceSpellLocked(true);
    setDiceSpellNotice(null);
    setForbiddenHandNote(null);
    if (onlineRoomCode && onlinePlayerId && roll) {
      socketRef.current?.emit("dice-roll", {
        roomCode: onlineRoomCode,
        playerId: onlinePlayerId,
        roll
      });
    }
  }

  function handleDiceRollComplete(result) {
    if (pendingForbidden?.diceRolls) {
      setDiceSpellRoll(result);
      setDiceSpellLocked(false);
      if (result.isFinal) setDiceSpellNotice("Chọn pháp sư đối thủ");
      return;
    }
    if (!selectedSpellId || !selectedPage?.diceRolls) return;
    setDiceSpellRoll(result);
    if (result.isFinal && result.value === 0) {
      const zeroTimer = window.setTimeout(() => {
        resolveZeroDiceSpell({ spellId: selectedSpellId, type: selectedType });
      }, 1400);
      effectTimersRef.current.push(zeroTimer);
      return;
    }
    if (result.isFinal && !hasPlayableDiceTarget({ spellId: selectedSpellId, type: selectedType, value: result.value })) {
      setDiceSpellNotice("Không thể thực hiện nước đi");
      setSpellGuideNote({
        spellId: selectedSpellId,
        message: "Không thể thực hiện nước đi"
      });
      const noMoveTimer = window.setTimeout(() => {
        resolveFailedDiceSpell({ spellId: selectedSpellId });
      }, 1400);
      effectTimersRef.current.push(noMoveTimer);
    }
  }

  function hasPlayableDiceTarget({ spellId, type, value }) {
    if (!game || !activePlayer || !spellId || !type) return false;
    const targets = legalTargets(game, activePlayer.id, type);
    return targets.some((target) => {
      const nextGame = playSpell(game, spellId, { type, targetId: target.id, valueOverride: value });
      return !nextGame.actionRejected;
    });
  }

  function startSpellbookCloseEffect(spellId, type) {
    const cardElement = spellCardRefs.current.get(spellId);
    const cardRect = cardElement?.getBoundingClientRect();
    const pageRect = cardElement?.querySelector(`[data-page-type="${type}"]`)?.getBoundingClientRect();
    const closeId = `${spellId}-${Date.now()}`;
    setClosingSpell({ id: spellId, type });
    if (cardRect) {
      setClosingBooks((current) => [...current, {
        id: closeId,
        left: cardRect.left,
        top: cardRect.top,
        width: cardRect.width,
        height: cardRect.height
      }]);
    }
    const closeTimer = window.setTimeout(() => {
      setClosingSpell(null);
      setClosingBooks((current) => current.map((book) => book.id === closeId ? { ...book, ghost: true } : book));
    }, 325);
    const removeTimer = window.setTimeout(() => {
      setClosingBooks((current) => current.filter((book) => book.id !== closeId));
    }, 625);
    effectTimersRef.current.push(closeTimer, removeTimer);
  }

  if (!data || !loadState.ready) {
    const progressValue = loadState.total ? Math.round((loadState.loaded / loadState.total) * 100) : 0;
    return (
      <main className="loading">
        <section className="loadingPanel">
          <strong>Đang mở cổng Ravenskeep...</strong>
          <div className="loadingTrack" aria-label="Đang tải assets" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progressValue} role="progressbar">
            <span style={{ "--load-progress": `${progressValue}%` }} />
          </div>
          <small>{progressValue}%</small>
        </section>
      </main>
    );
  }

  if (screen === "lobby") {
    return (
      <main className="app">
        <section
          className="phoneGame lobbyPhoneGame"
          ref={(element) => {
            if (!element) return;
            const syncLobbyBounds = () => {
              const rect = element.getBoundingClientRect();
              element.style.setProperty("--phone-game-top", `${rect.top}px`);
              element.style.setProperty("--phone-game-right", `${Math.max(0, window.innerWidth - rect.right)}px`);
              element.style.setProperty("--phone-game-bottom", `${Math.max(0, window.innerHeight - rect.bottom)}px`);
              element.style.setProperty("--phone-game-left", `${rect.left}px`);
            };
            syncLobbyBounds();
            window.requestAnimationFrame(syncLobbyBounds);
          }}
        >
          <Lobby
            onStart={startFromLobby}
            onCreateOnlineRoom={startOnlineRoom}
            onJoinOnlineRoom={joinOnlineRoom}
            onContinueWithBots={continueOnlineWithBots}
            onLeaveOnlineRoom={leaveOnlineRoom}
            onlineStatus={onlineStatus}
            onlineRoomCode={onlineRoomCode}
            onlinePlayerId={onlinePlayerId}
            onlinePlayers={onlinePlayers}
            onlinePlayerCount={playerCount}
            isOnlineHost={Boolean(isOnlineHost)}
            soundEnabled={soundEnabled}
            onToggleSound={() => setSoundEnabled((value) => !value)}
            expansionMode={soloExpansionMode}
            onToggleExpansionMode={() => setSoloExpansionMode((value) => !value)}
          />
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      {safeSparkles.map((s) => (
        <span key={s.id} className="floatingSparkle" style={{ left: `${s.left}px`, top: `${s.top}px`, width: `${s.size}px`, height: `${s.size}px` }} />
      ))}
      {closingBooks.map((book) => (
        <span
          key={book.id}
          className={book.ghost ? "closingBook ghost" : "closingBook"}
          style={{
            left: `${book.left}px`,
            top: `${book.top}px`,
            width: `${book.width}px`,
            height: `${book.height}px`
          }}
        />
      ))}
      {debugWizards && (
        <DebugBar
          game={game}
          setGame={setGame}
          captureState={captureState}
          debugShowTowers={debugShowTowers}
          setDebugShowTowers={setDebugShowTowers}
          debugShowWizards={debugShowWizards}
          setDebugShowWizards={setDebugShowWizards}
          debugShowTowerNames={debugShowTowerNames}
          setDebugShowTowerNames={setDebugShowTowerNames}
          debugShowWizardNames={debugShowWizardNames}
          setDebugShowWizardNames={setDebugShowWizardNames}
          debugShowTileNames={debugShowTileNames}
          setDebugShowTileNames={setDebugShowTileNames}
          debugShowTowerPaths={debugShowTowerPaths}
          setDebugShowTowerPaths={setDebugShowTowerPaths}
          debugShowSlotMachine={debugShowSlotMachine}
          setDebugShowSlotMachine={setDebugShowSlotMachine}
          debugShowPotionMinigame={debugShowPotionMinigame}
          setDebugShowPotionMinigame={setDebugShowPotionMinigame}
          debugShowWinBanner={debugShowWinBanner}
          setDebugShowWinBanner={setDebugShowWinBanner}
          debugShowLoseBanner={debugShowLoseBanner}
          setDebugShowLoseBanner={setDebugShowLoseBanner}
          setExpandedStackIndex={setExpandedStackIndex}
          forbiddenSpells={data.forbiddenSpells}
          spellbooks={data.spellbooks}
          handPlayerId={visibleHandPlayer?.id}
        />
      )}
      <section
        className="phoneGame"
        onClickCapture={(event) => {
          const target = event.target;
          const clickedSpellCard = target.closest?.(".spellCard");
          const selectedCard = target.closest?.(".spellCard.selected");
          const selectedPage = target.closest?.("[data-page-type]");
          clickedSelectedSpellRef.current = selectedCard
            ? { spellId: selectedSpellId, type: selectedPage?.dataset.pageType ?? selectedType }
            : null;
          if (selectedSpellId && target.closest?.(".forbiddenSpellOverlay") && !pendingForbidden) {
            clearSelectedSpell();
          } else if (selectedSpellId && target.closest?.(".forbiddenRow") && !pendingForbidden && !target.closest?.(".spellGuide")) {
            clearSelectedSpell();
          }
          if (!event.target.closest?.(".forbiddenRow") && !pendingForbidden) {
            setExpandedForbiddenId(null);
            setForbiddenHandNote(null);
          }
          if (
            selectedSpellId &&
            !pendingForbidden &&
            !target.closest?.(".wizard, .towerToken, .keepToken") &&
            !target.closest?.(".statusMenuBtn, .menuOverlay, .confirmOverlay") &&
            !target.closest?.(".spellGuide, .slotMachineOverlay, .potionOverlay, .diceWidget") &&
            !selectedCard
          ) {
            if (clickedSpellCard) suppressSpellClickRef.current = true;
            clearSelectedSpell();
          }
        }}
      >
        {forbiddenSparkles.map((sparkle) => (
          <span
            key={sparkle.id}
            className="floatingSparkle forbiddenCardSparkle"
            style={{
              left: `${sparkle.left}px`,
              top: `${sparkle.top}px`,
              width: `${sparkle.size}px`,
              height: `${sparkle.size}px`
            }}
          />
        ))}
        {debugShowSlotMachine && <SlotMachineOverlay onClose={() => setDebugShowSlotMachine(false)} />}
        {debugShowPotionMinigame && <PotionStirOverlay onClose={() => setDebugShowPotionMinigame(false)} debug={debugWizards} />}
        <div className="gameTopControls">
          <button className="statusMenuBtn" onClick={() => setShowMenu(true)} aria-label="Settings">
            <Settings size={16} />
          </button>
        </div>
        <OpponentPanel game={game} activePlayerId={displayedActivePlayer?.id} localPlayerId={localPlayerId} />

        <Board
          game={game}
          selectedType={effectiveSelectedType}
          selectableIds={effectiveSelectableIds}
          highlightedTileIds={highlightedTileIds}
          winnerInfo={visibleWinnerInfo}
          localPlayerId={localPlayerId}
          onNewGame={(activeWinner || debugShowWinBanner || debugShowLoseBanner) && (!isOnlineGame || isOnlineHost) ? requestNewGameConfirm : null}
          isForbiddenTargeting={Boolean(pendingForbidden)}
          forbiddenTargetType={pendingForbidden?.targetType ?? null}
          onPlayTarget={pendingForbidden ? handleForbiddenTarget : playDirect}
          onForbiddenDeselect={handleForbiddenDeselect}
          imprisoningTowerIds={imprisoningTowerIds}
          onUseForbidden={(spellId) => commitGame(useForbidden(game, spellId, { free: debugWizards }))}
          debugWizards={debugWizards}
          debugShowTowers={debugShowTowers}
          debugShowWizards={debugShowWizards}
          debugShowTowerNames={debugShowTowerNames}
          debugShowWizardNames={debugShowWizardNames}
          debugShowTileNames={debugShowTileNames}
          debugShowTowerPaths={debugShowTowerPaths}
          debugShowDiceOverlay={debugShowDiceOverlay || Boolean(remoteDiceContext)}
          diceContext={remoteDiceContext ?? (pendingForbidden?.diceRolls ? { type: "wizard", diceRolls: pendingForbidden.diceRolls, notice: diceSpellNotice } : selectedPage ? { type: selectedPage.type, diceRolls: selectedPage.diceRolls, notice: diceSpellNotice } : null)}
          diceReadOnly={Boolean(remoteDiceContext)}
          diceForcedRoll={remoteDiceContext?.forcedRoll ?? null}
          actionVisual={remoteActionVisual}
          turnPrompt={{
            isLocalTurn: displayedIsLocalTurn,
            wizardColor: displayedActivePlayer?.wizardColor ?? "blue",
            color: displayedActivePlayer?.color ?? "#050608",
            key: `${displayedIsLocalTurn ? "local" : "opponent"}-${displayedActivePlayer?.id ?? "none"}`
          }}
          onDiceRollStart={handleDiceRollStart}
          onDiceRollComplete={handleDiceRollComplete}
          debugShowSlotMachine={debugShowSlotMachine}
          tileStepY={debugTileStepY}
          towerStackStep={debugTowerStackStep}
          wizardOffsetY={undefined}
          towerJumpPaths={towerJumpPaths}
          hiddenShadowTileIndexes={hiddenShadowTileIndexes}
          lingeringCapturedWizardIds={lingeringCapturedWizardIds}
          lingeringSafeWizards={lingeringSafeWizards}
          expandedStackIndex={expandedStackIndex}
          onSetExpandedStackIndex={setExpandedStackIndex}
        />

        <OnlineLeaveNotice
          players={missingOnlinePlayers}
          game={game}
          timedOutPlayers={timedOutMissingPlayers}
          isHost={Boolean(isOnlineHost)}
          onContinueWithBots={continueOnlineWithBots}
          onLeaveOnlineRoom={leaveOnlineRoom}
        />

        <section className={isResultVisible ? "bottomDeck controlsLocked" : "bottomDeck"}>
          <div className="forbiddenArea">
            <ForbiddenRow
              spells={game.forbidden}
              allSpells={data.forbiddenSpells}
              expandedForbiddenId={expandedForbiddenId}
              setExpandedForbiddenId={(id) => {
                setForbiddenHandNote(null);
                setExpandedForbiddenId(id);
              }}
              pendingForbidden={pendingForbidden}
              isBotTurn={isBotTurn}
              localFullPotions={localFullPotions}
              potionSprite={forbiddenPotionSprite}
              debugWizards={debugWizards}
              onUseForbidden={useForbiddenCard}
              closingForbiddenId={closingForbiddenId}
              cardRefs={forbiddenCardRefs}
            />
            {selectedSpellId && activeSpellGuide && (
              <span ref={forbiddenSpellOverlayRef} className="forbiddenSpellOverlay" style={{ "--spell-guide-arrow-x": spellGuideArrowX }} aria-live="polite">
                <span className={spellGuideNote?.spellId === selectedSpellId ? "spellGuide forbiddenSpellGuide error" : "spellGuide forbiddenSpellGuide"}>
                  {activeSpellGuide}
                </span>
              </span>
            )}
          </div>
          <div
            className={displayedIsLocalTurn ? "playerControlArea activeTurn" : "playerControlArea"}
            style={{ "--local-player-color": localPlayer?.color }}
          >
            <div className={selectedSpellId ? "hand hasSpellSelection" : "hand"} style={bookVars}>
              <button
                className="handExchangeBtn"
                disabled={isBotTurn}
                onClick={() => { commitGame(replaceSpellbooks(game)); setSelectedSpellId(null); }}
              >
                Đổi Sách phép
              </button>
              <div className="handCards">
                {visibleHandPlayer.hand.map((spell, index) => (
                  <div
                    key={spell.id}
                    ref={(element) => {
                      if (element) spellCardRefs.current.set(spell.id, element);
                      else spellCardRefs.current.delete(spell.id);
                    }}
                    data-bounce=""
                    className={[
                      "spellCard",
                      spell.id === selectedSpellId ? "selected" : "",
                      spell.pages.length === 1 ? "singleSpellCard" : "multiSpellCard",
                      spell.id === selectedSpellId && selectedType ? `selected-${selectedType}` : "",
                      closingSpell?.id === spell.id ? "closing" : "",
                      drawAnimationIds.has(spell.id) ? "drawn" : "",
                      pendingDealIds.has(spell.id) ? "pendingDeal" : ""
                    ].filter(Boolean).join(" ")}
                    style={{ "--draw-index": index }}
                  >
                    <div className="spellPages">
                      {spell.pages.length === 1 ? (
                        <button
                          className={spell.id === selectedSpellId ? "spellPage single selected" : "spellPage single"}
                          data-page-type={spell.pages[0].type}
                          disabled={false}
                          onClick={() => chooseSpell(spell, spell.pages[0].type)}
                          aria-label={spellPageAriaLabel(spell.pages[0])}
                        >
                          {["tower", "wizard"].map((type) => {
                            const page = spell.pages[0].type === type ? spell.pages[0] : null;
                            return (
                              <span key={type} className={page ? "spellPageFace" : "spellPageFace blank"}>
                                <img src={page ? publicPath(`assets/sprites/items/${type === "tower" ? "tower-icon" : "wizard-icon"}.png`) : publicPath("assets/sprites/items/blank-page.png")} alt="" />
                                {page && <SpellPageValue page={page} bonusStep={visibleHandPlayer?.bonusStep ?? 0} />}
                              </span>
                            );
                          })}
                        </button>
                      ) : (
                        ["tower", "wizard"].map((type) => {
                          const page = spell.pages.find((item) => item.type === type);
                          const pageSelected = page && spell.id === selectedSpellId && selectedType === page.type;
                          return (
                            <button
                              key={type}
                              className={pageSelected ? "spellPage selected" : "spellPage"}
                              data-page-type={type}
                              disabled={false}
                              onClick={() => chooseSpell(spell, page.type)}
                              aria-label={spellPageAriaLabel(page)}
                            >
                              <span className="spellPageFace">
                                <img src={publicPath(`assets/sprites/items/${page.type === "tower" ? "tower-icon" : "wizard-icon"}.png`)} alt="" />
                                  <SpellPageValue page={page} bonusStep={visibleHandPlayer?.bonusStep ?? 0} />
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                ))}
              </div>
            {(expandedForbiddenId || pendingForbidden || forbiddenHandNote) && (
              <span className="handForbiddenOverlay" aria-live="polite">
                <span className="handForbiddenNote">
                  {forbiddenHandNote ?? FORBIDDEN_HAND_NOTE}
                </span>
              </span>
            )}
          </div>

            <Details
              game={game}
              activePlayer={displayedActivePlayer}
              localPlayer={localPlayer}
              isLocalTurn={displayedIsLocalTurn}
              expression={wizardExpression}
              onEndTurn={() => commitGame(endTurn(game))}
            />
          </div>
        </section>
        {showMenu && (
          <div className="menuOverlay" onClick={() => setShowMenu(false)}>
            <div className="menuPanel" onClick={(e) => e.stopPropagation()}>
              <button className="menuPanelBtn" onClick={requestLeaveLobbyConfirm}>
                <House size={16} /> Về Lobby
              </button>
              <button className="menuPanelBtn" onClick={() => requestNewGameConfirm({ restoreMenuOnCancel: true })}>
                <RotateCw size={16} /> Ván mới
              </button>
              <button className={soundEnabled ? "settingsSwitchRow active" : "settingsSwitchRow"} role="switch" aria-checked={soundEnabled} onClick={() => setSoundEnabled((v) => !v)}>
                <span>Sound</span>
                <span className="settingsSwitch" aria-hidden="true">
                  <span className="settingsSwitchKnob" />
                </span>
              </button>
            </div>
          </div>
        )}
        {confirmOverlay && (
          <div className="confirmOverlay" onClick={cancelConfirmOverlay}>
            <section
              className="confirmPanel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-title"
              onClick={(event) => event.stopPropagation()}
            >
              <h2 id="confirm-title">{confirmOverlay.title}</h2>
              <div className="confirmActions">
                <button className="confirmCancelBtn" type="button" onClick={cancelConfirmOverlay}>
                  Huỷ
                </button>
                <button className="confirmAcceptBtn" type="button" onClick={confirmOverlay.onConfirm}>
                  Đồng ý
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

function SpellPageValue({ page, bonusStep }) {
  if (page.diceRolls) {
    return (
      <b className="spellDiceValue" aria-hidden="true">
        <span className="spellDiceRolls">{page.diceRolls}</span>
        <span className="spellDiceIcon">⚂</span>
      </b>
    );
  }

  return <b className={bonusStep ? "spellValueBoosted" : ""}>+{page.value + bonusStep}</b>;
}

function spellPageAriaLabel(page) {
  const subject = page.type === "tower" ? "Tháp" : "Pháp sư";
  if (page.diceRolls) return `${subject} tung xúc xắc ${page.diceRolls} lần`;
  return `${subject} +${page.value}`;
}

function sanitizeSpellbooks(spellbooks) {
  return spellbooks.map((spellbook) => {
    const seen = new Set();
    const pages = spellbook.pages
      .filter((page) => page.type === "tower" || page.type === "wizard")
      .filter((page) => {
        if (seen.has(page.type)) return false;
        seen.add(page.type);
        return true;
      })
      .map((page) => {
        const diceRolls = Number(page.diceRolls);
        if (diceRolls === 1 || diceRolls === 2) {
          return {
            type: page.type,
            value: 0,
            diceRolls
          };
        }
        return {
          type: page.type,
          value: Math.min(3, Math.max(1, Number(page.value) || 1))
        };
      });

    return { ...spellbook, pages };
  }).filter((spellbook) => spellbook.pages.length >= 1 && spellbook.pages.length <= 2);
}

createRoot(document.getElementById("root")).render(<App />);
