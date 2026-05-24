import { useEffect, useState } from "react";
import { Check, Copy, Settings } from "lucide-react";
import { publicPath } from "../lib/assets";

export function Lobby({ onStart, onCreateOnlineRoom, onJoinOnlineRoom, onContinueWithBots, onLeaveOnlineRoom, onlineStatus = "", onlineRoomCode = "", onlinePlayerId = "", onlinePlayers = [], onlinePlayerCount = 2, isOnlineHost = false, soundEnabled = true, onToggleSound, expansionMode = false, onToggleExpansionMode }) {
  const [count, setCount] = useState(2);
  const [view, setView] = useState("mode");
  const [showIntro, setShowIntro] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [copiedRoomCode, setCopiedRoomCode] = useState(false);

  useEffect(() => {
    if (onlineRoomCode) setCount(onlinePlayerCount);
  }, [onlineRoomCode, onlinePlayerCount]);

  return (
    <div className="lobbyView">
      <img className="lobbyWizardHome" src={publicPath("assets/backgrounds/wizard-homescreen.png")} alt="" aria-hidden="true" />
      <img className="lobbyCloud lobbyCloudTop" src={publicPath("assets/backgrounds/cloud1.png")} alt="" aria-hidden="true" />
      <img className="lobbyCloud lobbyCloudBottom" src={publicPath("assets/backgrounds/cloud2.png")} alt="" aria-hidden="true" />
      <div className="lobbyContent">
        <header className="lobbyHeader">
          <img className="lobbyLogo" src={publicPath("assets/backgrounds/logo.png")} alt="Wondering Tower" />
          <span>với em gối</span>
        </header>

        {view === "mode" && (
          <div className="lobbyModes">
            <button className="lobbyModeCard lobbyModeButton" onClick={() => setView("solo")}>
              <span className="lobbyModeName">Solo</span>
              <small className="lobbyModeHint">Chơi với máy</small>
            </button>
            <button className="lobbyModeCard lobbyModeButton" onClick={() => setView("multi")}>
              <span className="lobbyModeName">Multi</span>
              <small className="lobbyModeHint">Chơi online cùng bạn</small>
            </button>
            <button className="lobbyModeCard lobbyModeButton lobbyModeCompact" type="button" onClick={() => setShowSettings(true)}>
              <span className="lobbyModeName lobbyModeNameIcon"><Settings size={14} /> Tuỳ chỉnh</span>
            </button>
            <button className="lobbyModeCard lobbyModeButton lobbyModeCompact" onClick={() => setShowIntro(true)}>
              <span className="lobbyModeName">Hướng dẫn</span>
            </button>
          </div>
        )}

        {view === "solo" && (
          <div className="lobbyPanel">
            <span className="lobbyModeName">Solo</span>
            <PlayerCountPicker count={count} setCount={setCount} />
            <small className="lobbyModeHint">{count - 1} bot</small>
            <button className={expansionMode ? "settingsSwitchRow active" : "settingsSwitchRow"} type="button" role="switch" aria-checked={expansionMode} onClick={() => onToggleExpansionMode?.()}>
              <span>Bản mở rộng</span>
              <span className="settingsSwitch" aria-hidden="true">
                <span className="settingsSwitchKnob" />
              </span>
            </button>
            <button className="lobbyStartBtn" onClick={() => onStart(count, { expansionMode })}>
              Bắt đầu
            </button>
            <button className="lobbyBackBtn" onClick={() => setView("mode")}>
              Quay lại
            </button>
          </div>
        )}

        {view === "multi" && (
          <div className="lobbyPanel">
            <span className="lobbyModeName">Multi</span>
            {onlineRoomCode ? (
              <>
                <span className="onlineRoomCodeRow">
                  <span className="onlineRoomCode">{onlineRoomCode}</span>
                  <button
                    className="onlineRoomCopyBtn"
                    type="button"
                    aria-label="Copy mã phòng"
                    title="Copy mã phòng"
                    onClick={() => copyRoomCode(onlineRoomCode, setCopiedRoomCode)}
                  >
                    {copiedRoomCode ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </span>
                <span className="onlineWaitingText">Chờ người chơi khác</span>
                <OnlinePlayerSlots
                  total={onlinePlayerCount}
                  active={onlinePlayers.filter((player) => player.connected || player.bot).length}
                />
                <OnlineLeaveLobbyNotice
                  players={onlinePlayers}
                  isHost={isOnlineHost}
                  onContinueWithBots={onContinueWithBots}
                  onLeaveOnlineRoom={onLeaveOnlineRoom}
                />
              </>
            ) : (
              <>
                <div className="onlineCreateSection">
                  <PlayerCountPicker count={count} setCount={setCount} />
                  <button className="lobbyStartBtn" type="button" onClick={() => onCreateOnlineRoom?.(count)}>
                    Tạo phòng
                  </button>
                </div>
                <span className="onlineDivider" aria-hidden="true" />
                <div className="onlineJoinSection">
                  <label className="onlineJoinBox">
                    <span>Mã phòng</span>
                    <input
                    value={joinCode}
                    maxLength={4}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    onChange={(event) => setJoinCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="1234"
                  />
                  </label>
                  <button className="lobbyBackBtn onlineJoinButton" type="button" onClick={() => onJoinOnlineRoom?.(joinCode)}>
                    Vào phòng
                  </button>
                </div>
              </>
            )}
            {!onlineRoomCode && onlineStatus && <small className="lobbyModeHint">{onlineStatus}</small>}
            <button
              className="lobbyBackBtn"
              onClick={() => {
                onLeaveOnlineRoom?.();
                setView("mode");
              }}
            >
              Quay lại
            </button>
          </div>
        )}
      </div>

      {showIntro && (
        <div className="lobbyIntroOverlay" role="dialog" aria-modal="true" aria-labelledby="lobby-intro-title">
          <section className="lobbyIntroPanel">
            <h2 id="lobby-intro-title">Wondering Tower</h2>
            <div className="lobbyGuideSprites" aria-hidden="true">
              <img src={publicPath("assets/sprites/characters/wizard/idle-1.png")} alt="" />
              <img src={publicPath("assets/sprites/towers/tower.png")} alt="" />
              <img src={publicPath("assets/sprites/items/spell-book-icon.png")} alt="" />
              <img src={publicPath("assets/sprites/items/potion-blue.png")} alt="" />
              <span>⚂</span>
            </div>
            <p>Dẫn pháp sư của bạn quanh bản đồ, leo lên các tháp và tìm đường về Tháp Đen.</p>
            <ul>
              <li>Dùng Sách phép để di chuyển Pháp sư hoặc Tháp.</li>
              <li>Bí thuật cần bình thuốc đầy và tạo ra các pha đảo chiều mạnh.</li>
              <li>Đưa pháp sư về an toàn, tích bình thuốc, và canh thời điểm tung xúc xắc.</li>
            </ul>
            <button className="lobbyStartBtn" onClick={() => setShowIntro(false)}>
              Vào game
            </button>
          </section>
        </div>
      )}

      {showSettings && (
        <div className="menuOverlay lobbySettingsOverlay" onClick={() => setShowSettings(false)}>
          <div className="menuPanel lobbySettingsPanel" onClick={(event) => event.stopPropagation()}>
            <span className="lobbySettingsTitle">Settings</span>
            <button className={soundEnabled ? "settingsSwitchRow active" : "settingsSwitchRow"} type="button" role="switch" aria-checked={soundEnabled} onClick={() => onToggleSound?.()}>
              <span>Sound</span>
              <span className="settingsSwitch" aria-hidden="true">
                <span className="settingsSwitchKnob" />
              </span>
            </button>
            <button className="menuPanelBtn" onClick={() => setShowSettings(false)}>
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function copyRoomCode(code, setCopied) {
  const roomCode = String(code || "").trim();
  if (!roomCode) return;
  const done = () => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1100);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(roomCode).then(done).catch(() => fallbackCopy(roomCode, done));
    return;
  }
  fallbackCopy(roomCode, done);
}

function fallbackCopy(text, done) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
    done();
  } finally {
    document.body.removeChild(textarea);
  }
}

function OnlinePlayerSlots({ total, active }) {
  const slotCount = Math.max(2, total || 2);
  const activeCount = Math.max(0, Math.min(active || 0, slotCount));
  return (
    <span className="onlinePlayerSlots" aria-label={`${activeCount}/${slotCount} người chơi đã vào phòng`}>
      {Array.from({ length: slotCount }).map((_, index) => (
        <img
          key={index}
          className={index < activeCount ? "active" : ""}
          src={publicPath("assets/sprites/characters/wizard-face/idle_blue.png")}
          alt=""
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function OnlineLeaveLobbyNotice({ players, isHost, onContinueWithBots, onLeaveOnlineRoom }) {
  const missing = players.filter((player) => !player.connected && !player.bot);
  if (!missing.length) return null;
  const hasTimedOut = missing.some((player) => player.timedOut);
  return (
    <div className="onlineLobbyLeaveNotice" role="status" aria-live="polite">
      <span>Người chơi đã rời phòng</span>
      {hasTimedOut ? (
        isHost ? (
          <div className="onlineLobbyLeaveActions">
            <button type="button" onClick={() => onContinueWithBots?.()}>Chơi tiếp với Bot</button>
            <button type="button" onClick={() => onLeaveOnlineRoom?.()}>Về Lobby</button>
          </div>
        ) : (
          <small>Đang chờ host quyết định.</small>
        )
      ) : (
        <small>Đang chờ người chơi quay lại...</small>
      )}
    </div>
  );
}

function PlayerCountPicker({ count, setCount, disabled = false }) {
  return (
    <div className="lobbyCountPicker">
      <span>Số người chơi</span>
      <div className="lobbyCountToggle" role="group" aria-label="Số người chơi">
        {[2, 3].map((n) => (
          <button
            key={n}
            className={n === count ? "miniButton active" : "miniButton"}
            onClick={() => setCount(n)}
            disabled={disabled}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
