/**
 * liquid-glass-filter/motion: the pure motion model (closed-form spring, velocity squash).
 * No DOM, no clock: the caller supplies time. The browser glue that drives a glass with it is
 * `attachGlassMotion` in the main entry.
 */
export type { SpringPhysics, SpringPerceptual, SpringConfig, SpringState, RestThreshold, LinearEasingOptions } from './spring.js';
export { springPhysics, springPerceptual, stepSpring, isSpringAtRest, springLinearEasing, DEFAULT_SPRING } from './spring.js';

export type { SquashConfig, SquashState, Deformation } from './squash.js';
export {
  squashSample,
  squashDecay,
  squashDeformation,
  isSquashAtRest,
  DEFAULT_SQUASH,
  SQUASH_REST,
  SQUASH_MAX_DT,
  IDENTITY_DEFORMATION,
} from './squash.js';
