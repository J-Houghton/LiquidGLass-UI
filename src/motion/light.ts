/**
 * Where the rim light comes from. Pure: rectangles and points in one coordinate space (the DOM
 * layer uses viewport px), angles in degrees with y down. The rim is lit on both sides, so a
 * direction and its opposite are the same light and angle arithmetic works modulo 180.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Direction from the rect's centre to the light, degrees, y down (0 = light to the right, −90 = above). */
export function lightAngleFor(rect: Rect, light: Point): number {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return (Math.atan2(light.y - cy, light.x - cx) * 180) / Math.PI;
}

/** Distance from a point to the rectangle's edge, 0 inside. */
export function distanceToRect(p: Point, rect: Rect): number {
  const dx = Math.max(rect.left - p.x, 0, p.x - (rect.left + rect.width));
  const dy = Math.max(rect.top - p.y, 0, p.y - (rect.top + rect.height));
  return Math.hypot(dx, dy);
}

/** 1 on the rectangle, 0 at `radius` away and beyond, smoothstep in between. */
export function pointerWeight(distance: number, radius: number): number {
  if (!(radius > 0)) return distance <= 0 ? 1 : 0;
  const t = 1 - Math.min(1, Math.max(0, distance / radius));
  return t * t * (3 - 2 * t);
}

export function mixPoints(a: Point, b: Point, w: number): Point {
  return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w };
}

/**
 * How much of the light's direction the pointer sets, 0..1: its `pointerWeight`, times how far off
 * the rect's centre it is, seen from a light `elevation` px above the page (r / √(r² + e²)). A light
 * right above the centre lights every side alike, so it has no direction to give and the scene
 * light shows through; further out it takes over. Without this, the direction from the centre to
 * a pointer near it swings half a turn in a few pixels. `elevation` 0 gives the weight alone.
 */
export function pointerPull(rect: Rect, pointer: Point, radius: number, elevation: number): number {
  const w = pointerWeight(distanceToRect(pointer, rect), radius);
  if (w <= 0 || !(elevation > 0)) return w;
  const r = Math.hypot(pointer.x - (rect.left + rect.width / 2), pointer.y - (rect.top + rect.height / 2));
  return (w * r) / Math.hypot(r, elevation);
}

/** `w` of the way from rim-light angle `a` to `b`, the short way round (lighting repeats every 180°). */
export function blendLightAngles(a: number, b: number, w: number): number {
  return a + lightAngleDelta(a, b) * Math.min(1, Math.max(0, w));
}

/** Shortest signed step from one rim-light angle to another, in (−90, 90] (lighting repeats every 180°). */
export function lightAngleDelta(fromDeg: number, toDeg: number): number {
  let d = ((toDeg - fromDeg) % 180) + 0; // + 0 turns a −0 remainder into +0
  if (d > 90) d -= 180;
  else if (d <= -90) d += 180;
  return d;
}

/** Move a fraction `smoothing` (0 stays, 1 snaps) of the short way from `current` toward `target`. */
export function approachLightAngle(current: number, target: number, smoothing: number): number {
  const k = Math.min(1, Math.max(0, smoothing));
  return current + lightAngleDelta(current, target) * k;
}
