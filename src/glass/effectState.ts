import type { SurfaceKind } from '../optics/surfaces';

/**
 * Shape and rendering parameters describing a single instance of the glass effect.
 *
 * NOTE: This interface mirrors the structure defined in {@link src/main.ts} so the
 * runtime entry point can continue to own the canonical state object while feature
 * modules can share the same typing information.
 */
export interface State {
  width: number;
  height: number;
  radius: number;
  refractiveIndex: number;
  glassThickness: number;
  bezelWidth: number;
  scale_px: number;
  showSpecular: boolean;
  specularAngleDeg: number;
  specularStrength: number;
  specularSaturation: number;
  dispersion: number;
  r: number;
  g: number;
  b: number;
  blurStdDev: number;
  blurKind: 'gauss' | 'noise1' | 'noise2';
  surface: SurfaceKind;
  saturation: number;
  frost: number;
  debug: boolean;
}

/**
 * Default configuration used by {@link src/main.ts}.  The values intentionally match
 * the inline literal in that file to avoid behavioural changes.  If defaults diverge
 * in the future, please document the reason here.
 */
export const DEFAULT_GLASS_EFFECT_STATE: State = {
  width: 400,
  height: 300,
  radius: 110,
  refractiveIndex: 1.5,
  glassThickness: 50,
  bezelWidth: 60,
  scale_px: 180,
  dispersion: 0.0,
  surface: 'convex_circle',
  frost: 0.05,
  saturation: 1,
  debug: false,
  blurStdDev: 0.7,
  blurKind: 'gauss',
  showSpecular: true,
  specularAngleDeg: 60,
  specularStrength: 0.9,
  specularSaturation: 0,
  r: 1.0,
  g: 0.25,
  b: -1.0,
};

/**
 * Factory helper that returns a fresh copy of {@link DEFAULT_GLASS_EFFECT_STATE}.
 */
export function createGlassEffectState(overrides: Partial<State> = {}): State {
  return { ...DEFAULT_GLASS_EFFECT_STATE, ...overrides };
}