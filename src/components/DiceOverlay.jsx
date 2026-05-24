import { useEffect, useRef, useState } from "react";

const FACE_SLOTS = {
  1: [0,0,0, 0,1,0, 0,0,0],
  2: [0,0,1, 0,0,0, 1,0,0],
  3: [0,0,1, 0,1,0, 1,0,0],
  4: [1,0,1, 0,0,0, 1,0,1],
  5: [1,0,1, 0,1,0, 1,0,1],
  6: [1,0,1, 1,0,1, 1,0,1],
};
const FACE_VALUES = {
  1: -2,
  2: -1,
  3: 0,
  4: 1,
  5: 2,
  6: 3,
};

const FACE_ROTATIONS = {
  1: [0,    0  ],
  2: [90,   0  ],
  3: [0,   -90 ],
  4: [0,    90 ],
  5: [-90,  0  ],
  6: [0,    180],
};

const BOARD_W = 96;
const BOARD_H = 100;
const DIE_HALF = 16;
const ROLL_DURATION_MS = 1300;
const PEAK_SCALE_OFFSET = 0.18;
const LAND_SCALE_OFFSET = 0.78;
const TOSS_HEIGHT = 46;
const BOUNCE_HEIGHT = 9;

function randomFace() {
  return 1 + Math.floor(Math.random() * 6);
}

function randomPos() {
  const left = BOARD_W / 2 - 14 + Math.random() * 28;
  const top = BOARD_H - DIE_HALF - Math.random() * 8;
  return { left: `${left}px`, top: `${top}px` };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function scaleAt(progress) {
  if (progress <= PEAK_SCALE_OFFSET) {
    return lerp(0, 1.5, progress / PEAK_SCALE_OFFSET);
  }
  if (progress <= LAND_SCALE_OFFSET) {
    return lerp(1.5, 0.9, (progress - PEAK_SCALE_OFFSET) / (LAND_SCALE_OFFSET - PEAK_SCALE_OFFSET));
  }
  return lerp(0.9, 1, (progress - LAND_SCALE_OFFSET) / (1 - LAND_SCALE_OFFSET));
}

function heightAt(progress) {
  if (progress <= LAND_SCALE_OFFSET) {
    const t = progress / LAND_SCALE_OFFSET;
    return Math.sin(t * Math.PI) * TOSS_HEIGHT;
  }
  const t = (progress - LAND_SCALE_OFFSET) / (1 - LAND_SCALE_OFFSET);
  return Math.sin(t * Math.PI) * BOUNCE_HEIGHT * (1 - t);
}

function Die({ anchorRef, wrapperRef, cubeRef }) {
  return (
    <div className="diceAnchor" ref={anchorRef}>
      <div className="diceWrapper" ref={wrapperRef}>
        <div className="diceScene">
          <div className="diceCube" ref={cubeRef}>
            {[1, 2, 3, 4, 5, 6].map(face => (
              <div key={face} className={`diceFace diceFace${face}`}>
                <b className="diceFaceNumber">{FACE_VALUES[face]}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DiceOverlay({ context, onRollStart, onRollComplete, readOnly = false, forcedRoll = null }) {
  const [results, setResults] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [rollCount, setRollCount] = useState(0);

  const anchor1 = useRef(null);
  const wrapper1 = useRef(null);
  const cube1    = useRef(null);
  const physicsFrame = useRef(null);
  const rollingTimeout = useRef(null);

  useEffect(() => {
    return () => {
      if (physicsFrame.current) cancelAnimationFrame(physicsFrame.current);
      if (rollingTimeout.current) clearTimeout(rollingTimeout.current);
    };
  }, []);

  useEffect(() => {
    setResults(null);
    setRollCount(0);
  }, [context?.type, context?.diceRolls, context?.playerId]);

  useEffect(() => {
    if (!forcedRoll || !anchor1.current || !wrapper1.current || !cube1.current) return;
    if (rollingTimeout.current) clearTimeout(rollingTimeout.current);
    const face = forcedRoll.face;
    const p1 = randomPos();
    anchor1.current.style.left = p1.left;
    anchor1.current.style.top = p1.top;
    animateDie(wrapper1.current, cube1.current, face, 0);
    setResults([face]);
    setRollCount(forcedRoll.rollCount ?? 1);
    setRolling(true);
    rollingTimeout.current = setTimeout(() => {
      const [rx, ry] = FACE_ROTATIONS[face];
      cube1.current.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
      setRolling(false);
      rollingTimeout.current = null;
    }, ROLL_DURATION_MS + 80);
  }, [forcedRoll?.id]);

  useEffect(() => {
    if (forcedRoll || rollCount > 0 || rolling || !anchor1.current || !wrapper1.current || !cube1.current) return;

    anchor1.current.style.left = `${BOARD_W / 2}px`;
    anchor1.current.style.top = `${BOARD_H - DIE_HALF - 4}px`;
    wrapper1.current.getAnimations().forEach(a => a.cancel());
    cube1.current.getAnimations().forEach(a => a.cancel());
    wrapper1.current.style.transform = "translate(0px, 0px) scale(1)";
    cube1.current.animate([
      { transform: "rotateX(18deg) rotateY(0deg)" },
      { transform: "rotateX(378deg) rotateY(360deg)" },
    ], { duration: 1500, easing: "linear", iterations: Infinity });
  }, [rollCount, rolling, context?.type, context?.diceRolls]);

  function animateDie(wrapperEl, cubeEl, face, delay) {
    wrapperEl.getAnimations().forEach(a => a.cancel());
    cubeEl.getAnimations().forEach(a => a.cancel());
    if (physicsFrame.current) cancelAnimationFrame(physicsFrame.current);
    wrapperEl.style.transform = "translate(0px, 0px) scale(0)";

    const startTime = performance.now() + delay;
    const driftX = -5 + Math.random() * 10;

    function tick(now) {
      const elapsed = Math.max(0, now - startTime);
      const progress = Math.min(1, elapsed / ROLL_DURATION_MS);
      const height = heightAt(progress);
      const scale = scaleAt(progress);
      const drift = driftX * Math.sin(progress * Math.PI);

      wrapperEl.style.transform = `translate(${drift}px, ${-height}px) scale(${scale})`;
      if (progress < 1) {
        physicsFrame.current = requestAnimationFrame(tick);
      } else {
        wrapperEl.style.transform = "translate(0px, 0px) scale(1)";
        physicsFrame.current = null;
      }
    }

    physicsFrame.current = requestAnimationFrame(tick);

    const [rx, ry] = FACE_ROTATIONS[face];
    const spins = 1 + Math.floor(Math.random() * 2);
    const startX = 20 + Math.random() * 80;
    const startY = Math.random() * 180;
    cubeEl.animate([
      { transform: `rotateX(${startX}deg) rotateY(${startY}deg)` },
      { transform: `rotateX(${rx + spins * 360}deg) rotateY(${ry + spins * 360}deg)` },
    ], { duration: ROLL_DURATION_MS, delay, easing: "linear", fill: "forwards" });
  }

  function roll() {
    if (rolling || readOnly) return;
    const f1 = randomFace();
    const nextRollCount = rollCount + 1;
    const rollLimit = Math.max(1, Math.min(2, context?.diceRolls ?? 2));
    onRollStart?.({
      face: f1,
      value: FACE_VALUES[f1],
      rollCount: nextRollCount,
      isFinal: nextRollCount >= rollLimit,
      type: context?.type,
      diceRolls: context?.diceRolls
    });

    const p1 = randomPos();
    anchor1.current.style.left = p1.left;
    anchor1.current.style.top  = p1.top;

    animateDie(wrapper1.current, cube1.current, f1, 0);

    setResults([f1]);
    setRollCount((count) => count + 1);
    setRolling(true);
    if (rollingTimeout.current) clearTimeout(rollingTimeout.current);
    rollingTimeout.current = setTimeout(() => {
      setRolling(false);
      onRollComplete?.({
        face: f1,
        value: FACE_VALUES[f1],
        rollCount: nextRollCount,
        isFinal: nextRollCount >= rollLimit
      });
      rollingTimeout.current = null;
    }, ROLL_DURATION_MS + 80);
  }

  const rollLimit = Math.max(1, Math.min(2, context?.diceRolls ?? 2));
  const canRoll = rollCount === 0 || rollCount < rollLimit;
  const remoteRollCount = forcedRoll?.rollCount ?? rollCount;
  const remoteRollText = remoteRollCount <= 1
    ? `có ${rollLimit} lượt tung xúc xắc`
    : "tung lại";
  const total = results ? FACE_VALUES[results[0]] : null;
  const subject = context?.type === "tower" ? "Tháp" : "Pháp sư";
  const resultText = readOnly
    ? null
    : rolling
    ? "Đang tung..."
    : context?.notice
      ? context.notice
      : rollCount === 0
        ? `Bạn có ${rollLimit} lần tung xúc xắc`
        : formatDiceResult(subject, total);

  return (
    <div className="diceWidget" onClick={e => e.stopPropagation()}>
      <div className="diceBoard">
        <Die anchorRef={anchor1} wrapperRef={wrapper1} cubeRef={cube1} />

        <div className="diceUI">
          {!readOnly && (rolling || canRoll) && (
            <button
              type="button"
              className="diceRollBtn"
              onClick={roll}
              disabled={rolling}
            >
              {rolling ? "..." : rollCount > 0 ? "Tung lại?" : "Tung"}
            </button>
          )}
          {readOnly ? (
            <div className="diceRemoteIntro" aria-live="polite">
              <img src={`/assets/sprites/characters/wizard-face/idle_${context?.wizardColor ?? "blue"}.png`} alt="" />
              <span>{remoteRollText}</span>
            </div>
          ) : (
            <div className="diceResultRow" aria-live="polite">
              {resultText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDiceResult(subject, value) {
  if (value == null) return `${subject} tiến/lùi n bước`;
  if (value > 0) return `${subject} tiến ${value} bước`;
  if (value < 0) return `${subject} lùi ${Math.abs(value)} bước`;
  return `${subject} không di chuyển`;
}
