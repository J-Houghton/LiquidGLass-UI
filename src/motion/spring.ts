/**
 * Closed-form damped spring. Pure: no DOM, no clock; the caller supplies `dt`.
 *
 * Every step is solved analytically from the current value and velocity, so the result does not
 * depend on the frame rate and a target change mid-flight keeps the velocity continuous (the
 * interruption problem CSS `linear()` springs cannot solve, research §4.5). Parameterised either
 * physically ({ mass, stiffness, damping }) or perceptually like Apple's `Spring(duration:bounce:)`
 * ({ duration, bounce }): `k = (2π/T)² m` and `c = 2(1 − b)√(km)` for b ≥ 0, `c = 2√(km)/(1 + b)`
 * for b < 0, which reproduces Apple's documented pairs: (0.5 s, 0.3) ⇔ (157.9, 17.6) and
 * (100, 10) ⇔ (0.63 s, 0.5).
 */

export interface SpringPhysics {
  mass: number;
  stiffness: number;
  damping: number;
}

export interface SpringPerceptual {
  /** Perceptual duration in seconds (the period of the undamped oscillation). */
  duration: number;
  /** −1 (very overdamped) .. 0 (critically damped) .. 1 (undamped). */
  bounce: number;
}

export type SpringConfig = Partial<SpringPhysics> | Partial<SpringPerceptual>;

export interface SpringState {
  value: number;
  velocity: number;
}

export interface RestThreshold {
  /** |value − target| below which the spring counts as settled. Default 0.001. */
  delta?: number;
  /** |velocity| below which the spring counts as settled. Default 0.01. */
  speed?: number;
}

const TWO_PI = 2 * Math.PI;
const BOUNCE_LIMIT = 0.999;

const isPerceptual = (c: SpringConfig): c is Partial<SpringPerceptual> => 'duration' in c || 'bounce' in c;

/** Normalise a config to physical constants. Perceptual input uses mass 1. */
export function springPhysics(config: SpringConfig = {}): SpringPhysics {
  if (isPerceptual(config)) {
    const duration = Math.max(1e-3, config.duration ?? 0.5);
    const bounce = Math.min(BOUNCE_LIMIT, Math.max(-BOUNCE_LIMIT, config.bounce ?? 0));
    const mass = 1;
    const stiffness = (TWO_PI / duration) ** 2 * mass;
    const critical = 2 * Math.sqrt(stiffness * mass);
    const damping = bounce >= 0 ? critical * (1 - bounce) : critical / (1 + bounce);
    return { mass, stiffness, damping };
  }
  return {
    mass: config.mass ?? DEFAULT_SPRING.mass,
    stiffness: config.stiffness ?? DEFAULT_SPRING.stiffness,
    damping: config.damping ?? DEFAULT_SPRING.damping,
  };
}

/** The perceptual view of physical constants (the inverse of `springPhysics`). */
export function springPerceptual(physics: SpringPhysics): SpringPerceptual {
  const { mass: m, stiffness: k, damping: c } = physics;
  const zeta = c / (2 * Math.sqrt(k * m));
  return { duration: TWO_PI * Math.sqrt(m / k), bounce: zeta <= 1 ? 1 - zeta : 1 / zeta - 1 };
}

/** Apple's documented default pair: duration 0.5 s, bounce 0.3 (stiffness 157.9, damping 17.6). */
export const DEFAULT_SPRING: SpringPhysics = { mass: 1, stiffness: (TWO_PI / 0.5) ** 2, damping: 2 * 0.7 * (TWO_PI / 0.5) };

/**
 * Advance a spring by `dt` seconds toward `target`. Exact for any `dt`; use it with a frame
 * delta, or with a large `dt` to jump to (near) rest.
 */
export function stepSpring(state: SpringState, target: number, dt: number, physics: SpringPhysics = DEFAULT_SPRING): SpringState {
  if (!(dt > 0)) return state;
  const { mass: m, stiffness: k, damping: c } = physics;
  const w0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));
  const x0 = state.value - target;
  const v0 = state.velocity;
  let x: number;
  let v: number;
  if (zeta < 1 - 1e-6) {
    // underdamped: decaying oscillation
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const e = Math.exp(-zeta * w0 * dt);
    const cos = Math.cos(wd * dt);
    const sin = Math.sin(wd * dt);
    const a = x0;
    const b = (v0 + zeta * w0 * x0) / wd;
    x = e * (a * cos + b * sin);
    v = e * ((b * wd - zeta * w0 * a) * cos - (a * wd + zeta * w0 * b) * sin);
  } else if (zeta < 1 + 1e-6) {
    // critically damped: fastest approach without overshoot
    const e = Math.exp(-w0 * dt);
    const a = x0;
    const b = v0 + w0 * x0;
    x = e * (a + b * dt);
    v = e * (b - w0 * (a + b * dt));
  } else {
    // overdamped: two decaying exponentials
    const s = w0 * Math.sqrt(zeta * zeta - 1);
    const r1 = -zeta * w0 + s;
    const r2 = -zeta * w0 - s;
    const c1 = (v0 - r2 * x0) / (r1 - r2);
    const c2 = x0 - c1;
    const e1 = Math.exp(r1 * dt);
    const e2 = Math.exp(r2 * dt);
    x = c1 * e1 + c2 * e2;
    v = c1 * r1 * e1 + c2 * r2 * e2;
  }
  return { value: target + x, velocity: v };
}

/** Settled within the thresholds? */
export function isSpringAtRest(state: SpringState, target: number, rest: RestThreshold = {}): boolean {
  return Math.abs(state.value - target) < (rest.delta ?? 1e-3) && Math.abs(state.velocity) < (rest.speed ?? 1e-2);
}

export interface LinearEasingOptions {
  /** Initial velocity in units of the 0..1 progress per second. Default 0. */
  velocity?: number;
  /** Sample spacing, ms. Default 16. */
  sampleMs?: number;
  /** Give up after this long, ms. Default 5000. */
  maxMs?: number;
  rest?: RestThreshold;
}

/**
 * Serialise a spring from 0 to 1 as a CSS `linear()` easing plus the duration it needs, for
 * `transition-timing-function` where a JS loop is unwanted. Fixed duration, no interruption:
 * a convenience, not the motion model.
 */
export function springLinearEasing(config: SpringConfig = {}, options: LinearEasingOptions = {}): { easing: string; durationMs: number } {
  const physics = springPhysics(config);
  const sampleMs = Math.max(1, options.sampleMs ?? 16);
  const maxMs = Math.max(sampleMs, options.maxMs ?? 5000);
  let state: SpringState = { value: 0, velocity: options.velocity ?? 0 };
  const values = [0];
  let t = 0;
  while (t < maxMs) {
    state = stepSpring(state, 1, sampleMs / 1000, physics);
    t += sampleMs;
    values.push(state.value);
    if (isSpringAtRest(state, 1, options.rest)) break;
  }
  values[values.length - 1] = 1;
  return { easing: `linear(${values.map((v) => String(Math.round(v * 10000) / 10000)).join(', ')})`, durationMs: t };
}
