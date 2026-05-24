import { WizardFace } from "./WizardFace";

export function StatusBar({ players, player, actionsRemaining, message, isLocalTurn, showTurnNotif, actions, expression = "idle" }) {
  return (
    <div className={showTurnNotif ? "statusBar turnStarting" : "statusBar"}>
      <span className="statusAvatar">
        <WizardFace wizardColor={player?.wizardColor ?? "blue"} />
      </span>
      <div className="statusTurnInfo">
        {isLocalTurn
          ? <span className={showTurnNotif ? "turnLabel turnLabelLocal turnLabelNotif" : "turnLabel turnLabelLocal"}>Lượt bạn</span>
          : <span className="turnLabel" style={{ "--turn-color": player.color }}>Lượt <i style={{ background: player.color }} /></span>
        }
        <div className="statusPips">
          {players.map((item) => (
            <i key={item.id} className={item.id === player.id ? "active" : ""} style={{ background: item.color }} />
          ))}
        </div>
      </div>
      <span className="statusMessage">{message}</span>
      {actions && <div className="statusActions">{actions}</div>}
    </div>
  );
}
