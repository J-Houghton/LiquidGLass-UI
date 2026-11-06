/**
 * Velocity-driven squash and stretch, the "gel" half of liquid motion (research §4.5: hi-slava,
 * clayharmon, the Oct-2026 tab bar). Pure. Feed pointer velocities with `squashSample`, decay
 * between samples with `squashDecay` (the caller supplies `dt`), read the deformation with
 * `squashDeformation`. Every output is hard-capped, as all three references do.
 */

export interface SquashConfig {
  /** Weight of a new velocity sample in the running average, 0..1 (clayharmon: 0.25). */
  smoothing: number;
  /** Speed in px/s at which the deformation reaches its caps (hi-slava: 32 px per frame, about 2000 px/s). */
  fullSpeed: number;
  /** Largest stretch along the motion axis, as a fraction of the size (clayharmon: 0.12). */
  maxStretch: number;
  /** Largest shear, degrees (clayharmon: 14). */
  maxSkew: number;
  /** Exponential decay rate of the smoothed velocity while no samples arrive, per second (hi-slava: 6). */
  decay: number;
  /** Magnitude at or below which the squash counts as at rest (hi-slava: 0.001). */
  rest: number;
}

export const DEFAULT_SQUASH: SquashConfig = {
  smoothing: 0.25,
  fullSpeed: 2000,
  maxStretch: 0.12,
  maxSkew: 14,
  decay: 6,
  rest: 0.001,
};

/** Smoothed velocity, px/s. */
export interface SquashState {
  vx: number;
  vy: number;
}

export const SQUASH_REST: Readonly<SquashState> = Object.freeze({ vx: 0, vy: 0 });

/** Largest frame delta the decay integrates over (LiquidGlassJS clamps to 1/30 s too). */
export const SQUASH_MAX_DT = 1 / 30;

export interface Deformation {
  scaleX: number;
  scaleY: number;
  /** Shear in degrees, following the horizontal velocity (positive to the right). */
  skewX: number;
  /** 0 at rest, 1 at `fullSpeed`. */
  magnitude: number;
}

export const IDENTITY_DEFORMATION: Readonly<Deformation> = Object.freeze({ scaleX: 1, scaleY: 1, skewX: 0, magnitude: 0 });

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Fold a raw velocity sample (px/s) into the running average. */
export function squashSample(state: SquashState, vx: number, vy: number, config: SquashConfig = DEFAULT_SQUASH): SquashState {
  if (!Number.isFinite(vx) || !Number.isFinite(vy)) return state;
  const a = clamp(config.smoothing, 0, 1);
  return { vx: a * vx + (1 - a) * state.vx, vy: a * vy + (1 - a) * state.vy };
}

/** Let the smoothed velocity decay over `dt` seconds (capped at `SQUASH_MAX_DT`). */
export function squashDecay(state: SquashState, dt: number, config: SquashConfig = DEFAULT_SQUASH): SquashState {
  const f = Math.exp(-Math.max(0, config.decay) * clamp(dt, 0, SQUASH_MAX_DT));
  return { vx: state.vx * f, vy: state.vy * f };
}

/**
 * The deformation for a smoothed velocity: stretch along the motion axis, squash across it by
 * half (the blob keeps roughly its area), shear with the horizontal component. Diagonal motion
 * degrades to a mild uniform scale, since axis-aligned scales cannot express a diagonal stretch.
 */
export function squashDeformation(state: SquashState, config: SquashConfig = DEFAULT_SQUASH): Deformation {
  const speed = Math.hypot(state.vx, state.vy);
  const full = Math.max(1e-6, config.fullSpeed);
  const magnitude = Math.min(1, speed / full);
  if (!(speed > 0)) return { ...IDENTITY_DEFORMATION };
  const ax = Math.abs(state.vx) / speed;
  const ay = Math.abs(state.vy) / speed;
  const s = magnitude * Math.max(0, config.maxStretch);
  return {
    scaleX: 1 + s * ax - (s / 2) * ay,
    scaleY: 1 + s * ay - (s / 2) * ax,
    skewX: clamp(state.vx / full, -1, 1) * Math.max(0, config.maxSkew),
    magnitude,
  };
}

/** True when the deformation is below the rest threshold (the loop may sleep). */
export function isSquashAtRest(state: SquashState, config: SquashConfig = DEFAULT_SQUASH): boolean {
  return squashDeformation(state, config).magnitude <= config.rest;
}
