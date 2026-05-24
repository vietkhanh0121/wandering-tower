export function shouldShiftBoardForExpandedStack(stackSize, row) {
  if (stackSize === 6) return row <= -2;
  if (stackSize === 7) return row <= -1;
  if (stackSize >= 8) return row <= 0;
  return false;
}

export function towerArcOffset(pos, level, total) {
  if (total <= 1 || level === 0) return { x: 0, y: 0 };
  const clampedLevel = Math.max(0, Math.min(total - 1, level));
  const t = clampedLevel / Math.max(1, total - 1);
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

export function towerArcTilt(pos, level, total) {
  if (total <= 1 || level === 0) return 0;
  const clampedLevel = Math.max(0, Math.min(total - 1, level));
  const t = clampedLevel / Math.max(1, total - 1);
  const direction = pos.x < 0 ? 1 : -1;
  return Math.round(direction * t * 22);
}

export function towerArcDebug(pos, total) {
  const topOffset = towerArcOffset(pos, total - 1, total);
  const center = { x: Math.round(pos.x + (pos.x < 0 ? 300 : -300)), y: Math.round(pos.y) };
  const base = { x: Math.round(pos.x), y: Math.round(pos.y) };
  const top = { x: Math.round(pos.x + topOffset.x), y: Math.round(pos.y + topOffset.y) };
  const controlLevel = Math.max(1, Math.round((total - 1) / 2));
  const controlOffset = towerArcOffset(pos, controlLevel, total);
  const control = { x: Math.round(pos.x + controlOffset.x), y: Math.round(pos.y + controlOffset.y) };
  const baseAngle = Math.atan2(base.y - center.y, base.x - center.x);
  const topAngle = Math.atan2(top.y - center.y, top.x - center.x);
  let delta = topAngle - baseAngle;
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  const angleDeg = Math.round(Math.abs(delta * 180 / Math.PI));

  return {
    center,
    base,
    top,
    path: `M ${base.x} ${base.y} Q ${control.x} ${control.y} ${top.x} ${top.y}`,
    label: {
      x: Math.round((base.x + top.x + control.x) / 3),
      y: Math.round((base.y + top.y + control.y) / 3)
    },
    angleLabel: `${angleDeg}deg`
  };
}
