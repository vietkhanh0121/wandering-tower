let ctx = null;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function osc(c, freq, startTime, duration, vol, wave = "square", freqEnd = null) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.connect(g);
  g.connect(c.destination);
  o.type = wave;
  o.frequency.setValueAtTime(freq, startTime);
  if (freqEnd != null) o.frequency.exponentialRampToValueAtTime(freqEnd, startTime + duration);
  g.gain.setValueAtTime(vol, startTime);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  o.start(startTime);
  o.stop(startTime + duration + 0.01);
}

export function playTowerHop() {
  const c = getCtx();
  const t = c.currentTime;
  // Takeoff pop
  osc(c, 320, t,        0.03, 0.18, "square", 160);
  // Whoosh body
  osc(c, 200, t + 0.02, 0.09, 0.14, "sawtooth", 80);
  // Landing thud
  osc(c, 130, t + 0.10, 0.14, 0.32, "square", 55);
  osc(c, 260, t + 0.10, 0.04, 0.12, "square", 130);
}

export function playWizardMove() {
  const c = getCtx();
  const t = c.currentTime;
  osc(c, 520, t,        0.04, 0.13, "square");
  osc(c, 700, t + 0.04, 0.05, 0.09, "square");
}

export function playWizardSafe() {
  const c = getCtx();
  const t = c.currentTime;
  [523, 659, 784, 1047].forEach((f, i) => {
    osc(c, f, t + i * 0.09, 0.18, 0.18, "square");
  });
}

export function playWizardCaptured() {
  const c = getCtx();
  const t = c.currentTime;
  osc(c, 380, t, 0.28, 0.28, "square", 90);
  osc(c, 190, t + 0.15, 0.20, 0.18, "square");
}

export function playPotionFilled() {
  const c = getCtx();
  const t = c.currentTime;
  [880, 1109, 1320, 1760].forEach((f, i) => {
    osc(c, f, t + i * 0.065, 0.12, 0.11, "triangle");
  });
}

export function playForbiddenCard() {
  const c = getCtx();
  const t = c.currentTime;
  osc(c, 260, t,        0.08, 0.22, "sawtooth");
  osc(c, 390, t + 0.07, 0.10, 0.17, "sawtooth");
  osc(c, 520, t + 0.15, 0.12, 0.13, "sawtooth");
}

export function playClick() {
  const c = getCtx();
  const t = c.currentTime;
  osc(c, 600, t, 0.03, 0.10, "square", 400);
}

export function playNewTurn() {
  const c = getCtx();
  const t = c.currentTime;
  osc(c, 440, t,        0.05, 0.14, "square");
  osc(c, 550, t + 0.06, 0.05, 0.11, "square");
}
