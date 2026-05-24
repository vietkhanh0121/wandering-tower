import { publicPath } from "../lib/assets";

export function WizardFace({ wizardColor = "blue" }) {
  return (
    <img
      className="wizardFaceImg"
      src={publicPath(`assets/sprites/characters/wizard-face/idle_${wizardColor}.png`)}
      alt=""
      aria-hidden="true"
    />
  );
}
