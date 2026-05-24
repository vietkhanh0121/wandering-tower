import { useEffect, useMemo, useRef, useState } from "react";

const CENTER = { x: 160, y: 216 };
const ESCAPE_RADIUS = 126;
const SEED_BUBBLE_COUNT = 3;
const RING_TOUCH_PADDING = 4;
const TRAIL_MS = 2400;
const SEED_LOCK_MS = 3000;
const ALL_BUBBLES_CAPTURE_LOOPS = 5;
const PARTIAL_BUBBLE_CAPTURE_LOOPS = 3;
const MIN_LOOP_POINTS = 12;
const MIN_LOOP_AREA = 8200;
const BUBBLE_EDGE_DRIFT_CHANCE = 0.28;
const BUBBLE_START_RADIUS_MIN = 8;
const BUBBLE_START_RADIUS_MAX = 28;
const CAULDRON_RING_SRC = "/assets/sprites/items/cauldron.png";
const SPOON_SRC = "/assets/sprites/items/spoon.png";
const CAULDRON_WATER_SRC = "/assets/sprites/cauldron/1.png";
const BUBBLE_SPRITE_SRC = "/assets/sprites/items/bubble.png";
const SPOON_SIZE = { width: 28, height: 113 };
const SPOON_TILT_DEG = 15;
const VARIABLE_TYPES = [
  { id: "wizard", label: "Pháp sư", icon: "/assets/sprites/items/wizard-icon.png", actions: ["+", "-"], max: 4 },
  { id: "tower", label: "Tháp", icon: "/assets/sprites/items/tower-icon.png", actions: ["+", "-"], max: 4 },
  { id: "forbidden", label: "Bí thuật", icon: "/assets/sprites/items/forbidden-icon.png", actions: ["Dùng", "Đổi"], max: 2 },
  { id: "spellbook", label: "Sách phép", icon: "/assets/sprites/items/spell-book-icon.png", actions: ["Dùng", "Đổi"], max: 2 }
];

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    area += points[i].x * next.y - next.x * points[i].y;
  }
  return Math.abs(area / 2);
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = (a.y > point.y) !== (b.y > point.y);
    if (crosses && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, a);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return distance(point, {
    x: a.x + dx * t,
    y: a.y + dy * t
  });
}

function bubbleTouchesPath(bubble, points, closed = false) {
  if (points.length < 2) return false;
  const limit = bubble.size + RING_TOUCH_PADDING;
  for (let i = 1; i < points.length; i += 1) {
    if (distanceToSegment(bubble, points[i - 1], points[i]) <= limit) return true;
  }
  if (closed && distanceToSegment(bubble, points[points.length - 1], points[0]) <= limit) return true;
  return false;
}

function anyBubbleTouchesPath(bubbles, points, closed = false) {
  return bubbles.some((bubble) => bubbleTouchesPath(bubble, points, closed));
}

function clearDrawnLine(drawnPointsRef, setDrawnPoints) {
  drawnPointsRef.current = [];
  setDrawnPoints([]);
}

function normalizeAngle(delta) {
  if (delta > Math.PI) return delta - Math.PI * 2;
  if (delta < -Math.PI) return delta + Math.PI * 2;
  return delta;
}

function randomInt(max) {
  return Math.floor(Math.random() * (max + 1));
}

function randomSeedValue(max) {
  return 1 + Math.floor(Math.random() * max);
}

function makeSeed() {
  const type = VARIABLE_TYPES[Math.floor(Math.random() * VARIABLE_TYPES.length)];
  const action = type.actions[Math.floor(Math.random() * type.actions.length)];
  const value = randomSeedValue(type.max);
  return {
    targetType: type.id,
    typeLabel: type.label,
    typeIcon: type.icon,
    actionType: action,
    value
  };
}

function seedParts(seed) {
  return [
    { seedPart: "type", label: seed.typeLabel, icon: seed.typeIcon, seed },
    { seedPart: "action", label: seed.actionType, seed },
    { seedPart: "value", label: `${seed.value}`, seed }
  ];
}

function seedSentence(seed) {
  if (!seed) return "";
  if (seed.targetType === "wizard") {
    return `Phù thuỷ ${seed.actionType === "+" ? "tiến" : "lùi"} ${seed.value} bước`;
  }
  if (seed.targetType === "tower") {
    return `Tháp ${seed.actionType === "+" ? "tiến" : "lùi"} ${seed.value} bước`;
  }
  return `${seed.actionType} ${seed.value} ${seed.typeLabel}`;
}

function makeBubbles(seed = makeSeed()) {
  const parts = seedParts(seed);
  return parts.map((part, index) => {
    const angle = (index / SEED_BUBBLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.7;
    const radius = BUBBLE_START_RADIUS_MIN + Math.random() * (BUBBLE_START_RADIUS_MAX - BUBBLE_START_RADIUS_MIN);
    const edgeDrift = Math.random() < BUBBLE_EDGE_DRIFT_CHANCE;
    const driftAngle = edgeDrift ? angle : angle + Math.PI / 2 + (Math.random() - 0.5) * 1.4;
    const speed = edgeDrift ? 8 + Math.random() * 4 : 2.6 + Math.random() * 3.4;
    return {
      id: index,
      ...part,
      x: CENTER.x + Math.cos(angle) * radius,
      y: CENTER.y + Math.sin(angle) * radius,
      vx: Math.cos(driftAngle) * speed,
      vy: Math.sin(driftAngle) * speed,
      size: 20 + Math.random() * 4,
      wobble: Math.random() * Math.PI * 2
    };
  });
}

function rerollBubbleVariables(bubbles) {
  const parts = seedParts(makeSeed());
  return bubbles.map((bubble, index) => ({
    ...bubble,
    captured: false,
    ...parts[index % parts.length]
  }));
}

function accelerateBubbleOutward(bubble) {
  const angle = Math.atan2(bubble.y - CENTER.y, bubble.x - CENTER.x);
  const speed = 15 + Math.random() * 6;
  return {
    ...bubble,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed
  };
}

function svgPoint(event, element) {
  const rect = element.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 320,
    y: ((event.clientY - rect.top) / rect.height) * 420
  };
}

function liveTrail(points, now) {
  return points.filter((point) => now - point.t <= TRAIL_MS);
}

function segmentIntersection(a, b, c, d) {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const denominator = r.x * s.y - r.y * s.x;
  if (Math.abs(denominator) < 0.0001) return null;
  const cx = c.x - a.x;
  const cy = c.y - a.y;
  const t = (cx * s.y - cy * s.x) / denominator;
  const u = (cx * r.y - cy * r.x) / denominator;
  if (t <= 0.04 || t >= 0.96 || u <= 0.04 || u >= 0.96) return null;
  return {
    x: a.x + t * r.x,
    y: a.y + t * r.y,
    t,
    u
  };
}

function findCaptureLoop(points, bubbles, { requireAll = true } = {}) {
  if (points.length < MIN_LOOP_POINTS) return null;
  const lastIndex = points.length - 1;
  const lineStart = points[lastIndex - 1];
  const lineEnd = points[lastIndex];
  for (let i = lastIndex - 3; i >= 1; i -= 1) {
    const hit = segmentIntersection(points[i - 1], points[i], lineStart, lineEnd);
    if (!hit) continue;
    const loop = [
      { x: hit.x, y: hit.y, t: lineEnd.t },
      ...points.slice(i, lastIndex + 1)
    ];
    if (loop.length < MIN_LOOP_POINTS) continue;
    if (polygonArea(loop) < MIN_LOOP_AREA) continue;
    const capturedBubbles = bubbles.filter((bubble) => !bubble.captured && pointInPolygon(bubble, loop));
    if (requireAll) {
      if (capturedBubbles.length !== bubbles.filter((bubble) => !bubble.captured).length) continue;
    } else if (capturedBubbles.length < 1) {
      continue;
    }
    return {
      loop,
      capturedBubbleIds: capturedBubbles.map((bubble) => bubble.id),
      tail: [
        { x: hit.x, y: hit.y, t: lineEnd.t },
        lineEnd
      ]
    };
  }
  return null;
}

export function PotionStirOverlay({ onClose, debug = false }) {
  const svgRef = useRef(null);
  const pointerIdRef = useRef(null);
  const phaseRef = useRef("drawing");
  const lastFrameRef = useRef(null);
  const seedRolledRef = useRef(false);
  const seedLockAtRef = useRef(null);
  const seedLockTimerRef = useRef(null);
  const lastSpoonPointRef = useRef(null);
  const lastPointerSpeedPointRef = useRef(null);
  const pointerSpeedRef = useRef(0);
  const pointerSpinDirectionRef = useRef(1);
  const hasPointerMotionRef = useRef(false);
  const waterSpinRef = useRef(0);
  const capturedBubbleIdsRef = useRef(new Set());
  const bubbleCaptureLoopsRef = useRef(new Map());
  const allBubblesCaptureLoopsRef = useRef(0);
  const phaseTwoLoopCountRef = useRef(0);
  const [sparkles, setSparkles] = useState([]);
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [phase, setPhase] = useState("drawing");
  const [bubbles, setBubbles] = useState(() => makeBubbles());
  const bubblesRef = useRef(bubbles);
  const [drawnPoints, setDrawnPoints] = useState([]);
  const drawnPointsRef = useRef([]);
  const [spoon, setSpoon] = useState({ x: CENTER.x, y: CENTER.y, active: false });
  const [waterSpin, setWaterSpin] = useState(0);
  const [seedLockRemaining, setSeedLockRemaining] = useState(SEED_LOCK_MS);
  const [completeProgress, setCompleteProgress] = useState(0);
  const [nowMs, setNowMs] = useState(() => performance.now());

  const livePoints = useMemo(() => liveTrail(drawnPoints, nowMs), [drawnPoints, nowMs]);
  const trailSegments = useMemo(() => livePoints.slice(1).map((point, index) => {
    const previous = livePoints[index];
    const age = nowMs - point.t;
    return {
      id: `${index}-${point.t}`,
      d: `M ${previous.x.toFixed(1)} ${previous.y.toFixed(1)} L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
      opacity: Math.max(0, Math.min(1, 1 - age / TRAIL_MS))
    };
  }), [livePoints, nowMs]);

  function syncPhase(nextPhase) {
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
  }

  function clearSeedLockTimer() {
    if (seedLockTimerRef.current) {
      window.clearTimeout(seedLockTimerRef.current);
      seedLockTimerRef.current = null;
    }
  }

  function updateSpoon(point, active = true) {
    lastSpoonPointRef.current = point;
    setSpoon({ x: point.x, y: point.y, active });
  }

  function updatePointerSpeed(point) {
    const previous = lastPointerSpeedPointRef.current;
    lastPointerSpeedPointRef.current = point;
    if (!previous?.t || !point.t) return;
    const elapsed = Math.max(16, point.t - previous.t);
    const instantSpeed = distance(previous, point) / elapsed;
    const previousAngle = Math.atan2(previous.y - CENTER.y, previous.x - CENTER.x);
    const nextAngle = Math.atan2(point.y - CENTER.y, point.x - CENTER.x);
    const spinDelta = normalizeAngle(nextAngle - previousAngle);
    if (Math.abs(spinDelta) > 0.01) pointerSpinDirectionRef.current = Math.sign(spinDelta);
    if (instantSpeed > 0.02) hasPointerMotionRef.current = true;
    pointerSpeedRef.current = pointerSpeedRef.current * 0.45 + instantSpeed * 0.55;
  }

  function startPhaseOneTimer(now = performance.now()) {
    clearSeedLockTimer();
    seedLockAtRef.current = now + SEED_LOCK_MS;
    setSeedLockRemaining(SEED_LOCK_MS);
    seedLockTimerRef.current = window.setTimeout(() => {
      seedLockTimerRef.current = null;
      if (phaseRef.current === "drawing") lockSeed();
    }, SEED_LOCK_MS);
  }

  function resetAttempt() {
    pointerIdRef.current = null;
    lastSpoonPointRef.current = null;
    lastPointerSpeedPointRef.current = null;
    pointerSpeedRef.current = 0;
    pointerSpinDirectionRef.current = 1;
    hasPointerMotionRef.current = false;
    seedRolledRef.current = false;
    clearSeedLockTimer();
    capturedBubbleIdsRef.current = new Set();
    bubbleCaptureLoopsRef.current = new Map();
    allBubblesCaptureLoopsRef.current = 0;
    phaseTwoLoopCountRef.current = 0;
    drawnPointsRef.current = [];
    setAttemptsUsed((count) => count + 1);
    setDrawnPoints([]);
    setSeedLockRemaining(SEED_LOCK_MS);
    setCompleteProgress(0);
    setSparkles([]);
    setBubbles(makeBubbles());
    syncPhase("drawing");
    startPhaseOneTimer();
  }

  function restartPotion() {
    pointerIdRef.current = null;
    lastSpoonPointRef.current = null;
    lastPointerSpeedPointRef.current = null;
    pointerSpeedRef.current = 0;
    pointerSpinDirectionRef.current = 1;
    hasPointerMotionRef.current = false;
    seedRolledRef.current = false;
    clearSeedLockTimer();
    capturedBubbleIdsRef.current = new Set();
    bubbleCaptureLoopsRef.current = new Map();
    allBubblesCaptureLoopsRef.current = 0;
    phaseTwoLoopCountRef.current = 0;
    drawnPointsRef.current = [];
    setAttemptsUsed(0);
    setDrawnPoints([]);
    setSeedLockRemaining(SEED_LOCK_MS);
    setCompleteProgress(0);
    setSparkles([]);
    setBubbles(makeBubbles());
    syncPhase("drawing");
    startPhaseOneTimer();
  }

  function markSeedRolled() {
    seedRolledRef.current = true;
  }

  function lockSeed() {
    clearSeedLockTimer();
    seedLockAtRef.current = null;
    syncPhase("locked");
    capturedBubbleIdsRef.current = new Set();
    bubbleCaptureLoopsRef.current = new Map();
    allBubblesCaptureLoopsRef.current = 0;
    phaseTwoLoopCountRef.current = 0;
    drawnPointsRef.current = [];
    setDrawnPoints([]);
    setCompleteProgress(0);
    setSparkles([]);
    setBubbles((current) => {
      const next = current.map((bubble) => accelerateBubbleOutward(bubble));
      bubblesRef.current = next;
      return next;
    });
  }

  useEffect(() => {
    bubblesRef.current = bubbles;
  }, [bubbles]);

  useEffect(() => {
    startPhaseOneTimer();
    return clearSeedLockTimer;
  }, []);

  useEffect(() => {
    let frameId = 0;
    function frame(now) {
      const previous = lastFrameRef.current ?? now;
      const dt = Math.min(0.04, (now - previous) / 1000);
      lastFrameRef.current = now;
      setNowMs(now);
      pointerSpeedRef.current *= 0.985;
      if (hasPointerMotionRef.current && pointerSpeedRef.current > 0.025) {
        const normalizedSpeed = Math.min(1, pointerSpeedRef.current / 1.45);
        const degreesPerSecond = 7 + normalizedSpeed * 74;
        waterSpinRef.current = (waterSpinRef.current + pointerSpinDirectionRef.current * ((now - previous) / 1000) * degreesPerSecond) % 360;
        setWaterSpin(waterSpinRef.current);
      }

      if (phaseRef.current === "drawing" || phaseRef.current === "locked") {
        setBubbles((current) => {
          const locked = phaseRef.current === "locked";
          const next = current.map((bubble) => {
            const drift = Math.sin(now / 420 + bubble.wobble) * (locked ? 4.2 : 1.6);
            const edgePush = locked ? 9.5 : 0;
            const edgeAngle = Math.atan2(bubble.y - CENTER.y, bubble.x - CENTER.x);
            const orbitSpeed = hasPointerMotionRef.current ? (locked ? 20 : 9) * Math.min(1, Math.max(0.25, pointerSpeedRef.current / 1.45)) : 0;
            const orbitX = -Math.sin(edgeAngle) * orbitSpeed * pointerSpinDirectionRef.current;
            const orbitY = Math.cos(edgeAngle) * orbitSpeed * pointerSpinDirectionRef.current;
            const chaos = locked ? Math.sin(now / 95 + bubble.wobble * 3.7) * 7.5 : 0;
            const chaosAngle = edgeAngle + Math.PI / 2 + Math.sin(now / 180 + bubble.wobble) * 1.9;
            const chaosX = Math.cos(chaosAngle) * chaos;
            const chaosY = Math.sin(chaosAngle) * chaos;
            return {
              ...bubble,
              x: bubble.x + (bubble.vx + Math.cos(edgeAngle) * edgePush + orbitX + chaosX + drift) * dt,
              y: bubble.y + (bubble.vy + Math.sin(edgeAngle) * edgePush + orbitY + chaosY - drift * 0.55) * dt
            };
          });
          bubblesRef.current = next;
          return next;
        });
      }

      const activeTrail = liveTrail(drawnPointsRef.current, now);
      if (activeTrail.length !== drawnPointsRef.current.length) {
        drawnPointsRef.current = activeTrail;
        setDrawnPoints(activeTrail);
      }
      if (phaseRef.current === "drawing" || phaseRef.current === "locked") {
        const activeBubbles = bubblesRef.current.filter((bubble) => !bubble.captured);
        const escaped = activeBubbles.some((bubble) => distance(bubble, CENTER) > ESCAPE_RADIUS);
        const touchedLine = anyBubbleTouchesPath(activeBubbles, activeTrail);
        if (escaped || touchedLine) {
          if (escaped) resetAttempt();
          else clearDrawnLine(drawnPointsRef, setDrawnPoints);
        }
      }

      if (phaseRef.current === "drawing" && seedLockAtRef.current != null) {
        const remaining = Math.max(0, seedLockAtRef.current - now);
        setSeedLockRemaining(remaining);
      }

      frameId = requestAnimationFrame(frame);
    }

    frameId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(frameId);
      clearSeedLockTimer();
    };
  }, []);

  function handlePointerDown(event) {
    if ((phaseRef.current !== "drawing" && phaseRef.current !== "locked") || !svgRef.current) return;
    event.stopPropagation();
    pointerIdRef.current = event.pointerId;
    svgRef.current.setPointerCapture?.(event.pointerId);
    const point = { ...svgPoint(event, svgRef.current), t: performance.now() };
    lastPointerSpeedPointRef.current = point;
    updateSpoon(point);
    const nextPoints = [...liveTrail(drawnPointsRef.current, point.t), point];
    drawnPointsRef.current = nextPoints;
    setDrawnPoints(nextPoints);
  }

  function handlePointerMove(event) {
    if ((phaseRef.current !== "drawing" && phaseRef.current !== "locked") || pointerIdRef.current !== event.pointerId || !svgRef.current) return;
    event.stopPropagation();
    const point = { ...svgPoint(event, svgRef.current), t: performance.now() };
    updatePointerSpeed(point);
    updateSpoon(point);
    const previous = drawnPointsRef.current[drawnPointsRef.current.length - 1];
    if (previous && distance(previous, point) < 4) return;
    const nextPoints = [...liveTrail(drawnPointsRef.current, point.t), point];
    drawnPointsRef.current = nextPoints;
    setDrawnPoints(nextPoints);
    if (anyBubbleTouchesPath(bubblesRef.current, nextPoints)) {
      clearDrawnLine(drawnPointsRef, setDrawnPoints);
      return;
    }
    const captureLoop = findCaptureLoop(nextPoints, bubblesRef.current, { requireAll: phaseRef.current === "drawing" });
    if (!captureLoop) return;
    handleCaptureLoop(captureLoop);
  }

  function handleCaptureLoop(captureLoop) {
    drawnPointsRef.current = captureLoop.tail;
    setDrawnPoints(captureLoop.tail);
    if (phaseRef.current === "drawing") {
      markSeedRolled();
      setBubbles((current) => {
        const next = rerollBubbleVariables(current);
        bubblesRef.current = next;
        return next;
      });
      return;
    }

    phaseTwoLoopCountRef.current += 1;
    const remainingBubbleIds = bubblesRef.current.filter((bubble) => !bubble.captured).map((bubble) => bubble.id);
    const capturesAllRemaining = remainingBubbleIds.length > 0 && remainingBubbleIds.every((id) => captureLoop.capturedBubbleIds.includes(id));
    const nextCapturedIds = new Set(capturedBubbleIdsRef.current);

    if (capturesAllRemaining) {
      allBubblesCaptureLoopsRef.current += 1;
      if (allBubblesCaptureLoopsRef.current >= ALL_BUBBLES_CAPTURE_LOOPS) {
        remainingBubbleIds.forEach((id) => nextCapturedIds.add(id));
      }
    } else {
      allBubblesCaptureLoopsRef.current = 0;
      const nextBubbleLoops = new Map(bubbleCaptureLoopsRef.current);
      captureLoop.capturedBubbleIds.forEach((id) => {
        const nextCount = (nextBubbleLoops.get(id) ?? 0) + 1;
        nextBubbleLoops.set(id, nextCount);
        if (nextCount >= PARTIAL_BUBBLE_CAPTURE_LOOPS) nextCapturedIds.add(id);
      });
      bubbleCaptureLoopsRef.current = nextBubbleLoops;
    }

    const previousCapturedIds = capturedBubbleIdsRef.current;
    capturedBubbleIdsRef.current = nextCapturedIds;
    const nextCompleteProgress = Math.min(1, nextCapturedIds.size / Math.max(1, bubblesRef.current.length));
    setCompleteProgress(nextCompleteProgress);
    setBubbles((current) => {
      const newlyCaptured = current.filter((bubble) => nextCapturedIds.has(bubble.id) && !previousCapturedIds.has(bubble.id));
      if (newlyCaptured.length) {
        const nextSparkles = newlyCaptured.map((bubble) => ({
          id: `${bubble.id}-${performance.now()}`,
          x: bubble.x,
          y: bubble.y
        }));
        setSparkles((currentSparkles) => [
          ...currentSparkles,
          ...nextSparkles
        ]);
        window.setTimeout(() => {
          const sparkleIds = new Set(nextSparkles.map((sparkle) => sparkle.id));
          setSparkles((currentSparkles) => currentSparkles.filter((sparkle) => !sparkleIds.has(sparkle.id)));
        }, 620);
      }
      const next = current.map((bubble) => nextCapturedIds.has(bubble.id) ? { ...bubble, captured: true } : bubble);
      bubblesRef.current = next;
      return next;
    });
    if (nextCompleteProgress >= 1) syncPhase("success");
  }

  function bubbleLabel(bubble) {
    return bubble.label;
  }

  function renderBubbleContent(bubble) {
    if (bubble.seedPart === "type" && bubble.icon) {
      return <image className="potionBubbleIcon" href={bubble.icon} x="-10" y="-10" width="20" height="20" preserveAspectRatio="xMidYMid meet" />;
    }
    return <text className="potionBubbleLabel" y="-1">{bubbleLabel(bubble)}</text>;
  }

  function resultSeed() {
    return bubbles[0]?.seed ?? null;
  }

  function hudText() {
    if (phase === "success") return "Hoàn thành";
    if (phase === "locked") {
      const maxPartial = Math.max(0, ...Array.from(bubbleCaptureLoopsRef.current.values()));
      const targetProgress = allBubblesCaptureLoopsRef.current > 0
        ? `Tất cả ${allBubblesCaptureLoopsRef.current}/${ALL_BUBBLES_CAPTURE_LOOPS}`
        : `Lẻ ${maxPartial}/${PARTIAL_BUBBLE_CAPTURE_LOOPS}`;
      return `Capture ${capturedBubbleIdsRef.current.size}/${bubbles.length} · ${targetProgress} · Vòng ${phaseTwoLoopCountRef.current}`;
    }
    return `Lock sau ${(seedLockRemaining / 1000).toFixed(1)}s`;
  }

  function hudPercent() {
    if (phase === "success") return 100;
    if (phase === "locked") return completeProgress * 100;
    return Math.max(0, Math.min(100, 100 - (seedLockRemaining / SEED_LOCK_MS) * 100));
  }

  function bubbleClassName() {
    if (phase === "success") return "potionBubbleGroup success";
    if (phase === "locked") return "potionBubbleGroup locked";
    return "potionBubbleGroup";
  }

  function bubbleGroupClassName(bubble) {
    return [bubbleClassName(), bubble.captured ? "captured" : ""].filter(Boolean).join(" ");
  }

  function ringClassName() {
    if (phase === "locked") return "potionRing locked";
    return "potionRing";
  }

  function resetSpinOnRelease() {
    drawnPointsRef.current = [];
    setDrawnPoints([]);
  }

  function handlePointerUp(event) {
    if (pointerIdRef.current !== event.pointerId || !svgRef.current) return;
    event.stopPropagation();
    svgRef.current.releasePointerCapture?.(event.pointerId);
    pointerIdRef.current = null;
    lastSpoonPointRef.current = null;
    lastPointerSpeedPointRef.current = null;
    setSpoon((current) => ({ ...current, active: false }));
    resetSpinOnRelease();
  }

  const ringClass = ringClassName();
  const progressPercent = Math.max(0, Math.min(100, hudPercent()));
  const startPoint = phase === "locked" && livePoints.length > 0 ? livePoints[0] : null;
  const stageClass = phase === "locked" ? "potionStage locked" : phase === "success" ? "potionStage success" : "potionStage";
  const completedSeed = phase === "success" ? resultSeed() : null;

  return (
    <div className="potionOverlay" onClick={(event) => event.stopPropagation()}>
      <button
        className="potionCloseBtn"
        type="button"
        aria-label="Đóng mini game nấu thuốc"
        onClick={(event) => {
          event.stopPropagation();
          onClose?.();
        }}
      >
        ×
      </button>
      <div className={stageClass}>
        <svg
          ref={svgRef}
          className="potionSvg"
          viewBox="0 0 320 420"
          role="img"
          aria-label="Mini game nấu thuốc"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <image
            className="cauldronRingSprite"
            href={CAULDRON_RING_SRC}
            x="-7.2"
            y="55.3"
            width="334.4"
            height="323.4"
            preserveAspectRatio="xMidYMid meet"
          />
          {false && (
            <>
              <image
                className="cauldronWaterSprite"
                href={CAULDRON_WATER_SRC}
                x="39.6"
                y="95.6"
                width="240.8"
                height="240.8"
                transform={`rotate(${waterSpin.toFixed(2)} ${CENTER.x} ${CENTER.y})`}
                preserveAspectRatio="xMidYMid meet"
              />
              <circle className="cauldronWaterOverlay" cx={CENTER.x} cy={CENTER.y} r="112" />
            </>
          )}
          {debug && <circle className="escapeLimit" cx={CENTER.x} cy={CENTER.y} r={ESCAPE_RADIUS} />}
          {startPoint && (
            <g className="potionLineStart" transform={`translate(${startPoint.x.toFixed(1)} ${startPoint.y.toFixed(1)})`}>
              <circle r="7" />
              <path d="M -3 0 L -0.5 3 L 4 -4" />
            </g>
          )}
          {trailSegments.map((segment) => (
            <path
              key={segment.id}
              className={ringClass}
              d={segment.d}
              style={{ opacity: segment.opacity }}
            />
          ))}
          {bubbles.filter((bubble) => !bubble.captured).map((bubble) => (
            <g key={bubble.id} className={bubbleGroupClassName(bubble)} transform={`translate(${bubble.x.toFixed(1)} ${bubble.y.toFixed(1)})`}>
              <image
                className="potionBubbleSprite"
                href={BUBBLE_SPRITE_SRC}
                x={(-bubble.size).toFixed(1)}
                y={(-bubble.size).toFixed(1)}
                width={(bubble.size * 2).toFixed(1)}
                height={(bubble.size * 2).toFixed(1)}
                preserveAspectRatio="xMidYMid meet"
              />
              {renderBubbleContent(bubble)}
            </g>
          ))}
          {sparkles.map((sparkle) => (
            <foreignObject
              key={sparkle.id}
              className="potionBubbleSparkle"
              x={(sparkle.x - 34).toFixed(1)}
              y={(sparkle.y - 34).toFixed(1)}
              width="68"
              height="68"
            >
              <span />
            </foreignObject>
          ))}
          {spoon.active && (
            <image
              className="spoonSprite"
              href={SPOON_SRC}
              x="0"
              y="0"
              width={SPOON_SIZE.width}
              height={SPOON_SIZE.height}
              transform={`translate(${spoon.x.toFixed(1)} ${spoon.y.toFixed(1)}) rotate(${SPOON_TILT_DEG}) scale(-1 -1)`}
              preserveAspectRatio="xMidYMid meet"
            />
          )}
        </svg>
        <div className="potionHud">
          <span>{hudText()}</span>
          <i style={{ "--hold-left": `${progressPercent}%` }} />
          <small>{`Lỗi ${attemptsUsed}`}</small>
          {phase === "success" && (
            <>
              <div className="potionResult">
                <div className="potionResultBubbles" aria-hidden="true">
                  {bubbles.map((bubble) => (
                    <span key={`result-${bubble.id}`}>
                      {bubble.seedPart === "type" && bubble.icon ? <img src={bubble.icon} alt={bubble.typeLabel} /> : bubbleLabel(bubble)}
                    </span>
                  ))}
                </div>
                <strong>{seedSentence(completedSeed)}</strong>
              </div>
              <button
                className="potionReplayBtn"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  restartPotion();
                }}
              >
                Chơi lại
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
