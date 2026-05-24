export function WizardFace({ wizardColor = "blue" }) {
  return (
    <img
      className="wizardFaceImg"
      src={`/assets/sprites/characters/wizard-face/idle_${wizardColor}.png`}
      alt=""
      aria-hidden="true"
    />
  );
}
