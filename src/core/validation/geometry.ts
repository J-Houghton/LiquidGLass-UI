import type { SurfaceKind } from '../optics/surfaces.js';

export type ShapeKind = 'circle' | 'rect';

export type InputState = {
  width: number;
  height: number;
  radius: number;
  bezelWidth: number;
  glassThickness: number;
  surface: SurfaceKind;
};

export type Validated = {
  kind: ShapeKind;
  width: number;
  height: number;
  radius: number;
  bezelWidth: number;
  glassThickness_eff: number;
  surface: SurfaceKind;
  notes: string[];
};

/** standard smoothstep [0..1] -> [0..1] */
function smoothstep01(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

/**
 * Map a raw glass thickness from a 0‒`maxUI` range into an effective thickness.
 * A smoothstep curve is used to give finer control near zero.
 */
export function mapGlassThickness(raw: number, maxUI = 200): number {
  const x = raw / Math.max(1, maxUI);
  return maxUI * smoothstep01(x);
}

/**
 * Validate and coerce user input describing the geometry and materials of the
 * glass effect.  This routine enforces a handful of invariants and emits
 * human‑readable notes whenever values are adjusted:
 *
 *  1. **Shape determination** – if width and height match, the shape is
 *     considered a circle; otherwise it is a rounded rectangle.
 *
 *  2. **Dimension clamps** – the radius cannot exceed half of the smaller
 *     side; the bezel width cannot exceed the radius or half of the minimum
 *     side.  Both values are clamped to at least 1.
 *
 *  3. **Surface validity** – some surface profiles are only meaningful on
 *     circles.  When a rectangle is selected and the chosen surface equals
 *     the `circleOnlySurface` option (default `'convex_circle'`), the
 *     surface is coerced to `'convex_squircle'`.
 *
 *  4. **Material mapping** – the UI supplies a linear glass thickness from
 *     0 to `thicknessMaxUI`.  To give the user finer control near zero
 *     thickness, the value is passed through a smoothstep curve via
 *     `mapGlassThickness`.  The returned effective thickness is used by
 *     the optics and noted whenever it differs from the raw input.
 */
export function validate(
  state: InputState,
  opts?: {
    circleOnlySurface?: SurfaceKind;
    thicknessMaxUI?: number;
  }
): Validated {
  const notes: string[] = [];
  const circleOnly = opts?.circleOnlySurface ?? 'convex_circle';
  const tMax = opts?.thicknessMaxUI ?? 200;

  // 1. Shape determination
  const kind: ShapeKind = state.width === state.height ? 'circle' : 'rect';

  // 2. Base dimensions and clamps
  const minSide = Math.min(state.width, state.height);
  const halfMin = Math.floor(minSide / 2);
  let radius = Math.max(1, Math.min(state.radius, halfMin));
  if (radius !== state.radius) notes.push(`radius→${radius} (max ${halfMin})`);
  const bMax = Math.min(halfMin, radius);
  let bezelWidth = Math.max(1, Math.min(state.bezelWidth, bMax));
  if (bezelWidth !== state.bezelWidth) notes.push(`bezelWidth→${bezelWidth} (max ${bMax})`);

  // 3. Surface validity
  let surface = state.surface;
  if (kind === 'rect' && surface === circleOnly) {
    surface = 'convex_squircle';
    notes.push(`surface→${surface} (circle-only disabled for rectangles)`);
  }

  // 4. Material mapping (smooth near zero)
  const glassThickness_eff = mapGlassThickness(state.glassThickness, tMax);
  if (Math.abs(glassThickness_eff - state.glassThickness) > 1e-6) {
    notes.push(`glassThickness smoothed (${state.glassThickness}→${glassThickness_eff.toFixed(1)})`);
  }

  return {
    kind,
    width: state.width,
    height: state.height,
    radius,
    bezelWidth,
    glassThickness_eff,
    surface,
    notes,
  };
}