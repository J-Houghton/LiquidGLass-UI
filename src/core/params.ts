import { isSurfaceKind, type SurfaceKind } from './optics/surfaces.js';
import { mapGlassThickness } from './validation/geometry.js';
import type { GlassContainerParams } from './defaults.js';

export type BlurKind = 'gauss' | 'noise1' | 'noise2';
export const BLUR_KINDS: readonly BlurKind[] = ['gauss', 'noise1', 'noise2'];

/** The full parameter set of one glass surface. All lengths are CSS px. */
export interface GlassParams {
  // geometry
  width: number;
  height: number;
  radius: number;
  bezelWidth: number;
  // optics
  surface: SurfaceKind;
  refractiveIndex: number;
  /** Thickness of the flat interior glass, px (literal; no UI curve applied). */
  glassThickness: number;
  /** Maximum displacement in px. The map encodes the shape; this sets the magnitude. */
  displacementScale: number;
  /** Share of the bezel, from the rim inward, that disperses colour (0..1). */
  chromaticBezelFraction: number;
  /** Chromatic aberration strength; 0 disables the stage. */
  dispersion: number;
  // look
  blurKind: BlurKind;
  /** Blur amount: Gaussian standard deviation, or noise displacement scale for noise kinds. */
  blur: number;
  specular: boolean;
  specularAngleDeg: number;
  specularStrength: number;
  /** Black tint over the glass, 0..1 alpha. */
  tint: number;
  saturation: number;
}

export const DEFAULT_GLASS_PARAMS: Readonly<GlassParams> = Object.freeze({
  width: 300,
  height: 120,
  radius: 60,
  bezelWidth: 60,
  surface: 'convex_squircle',
  refractiveIndex: 1.5,
  glassThickness: 31.25, // the 1.x default of 50 after its smoothstep curve
  displacementScale: 180,
  chromaticBezelFraction: 0.25,
  dispersion: 0,
  blurKind: 'gauss',
  blur: 0.2,
  specular: true,
  specularAngleDeg: 60,
  specularStrength: 0.9,
  tint: 0.05,
  saturation: 1,
} satisfies GlassParams);

export const GLASS_PARAM_KEYS = Object.keys(DEFAULT_GLASS_PARAMS) as readonly (keyof GlassParams)[];

export interface ResolvedGlassParams extends GlassParams {
  shape: 'circle' | 'rect';
  /** Human-readable record of every value that was clamped or replaced, and why. */
  notes: readonly string[];
}

type NumericKey = {
  [K in keyof GlassParams]: GlassParams[K] extends number ? K : never;
}[keyof GlassParams];

const NUMERIC_KEYS: readonly NumericKey[] = [
  'width',
  'height',
  'radius',
  'bezelWidth',
  'refractiveIndex',
  'glassThickness',
  'displacementScale',
  'chromaticBezelFraction',
  'dispersion',
  'blur',
  'specularAngleDeg',
  'specularStrength',
  'tint',
  'saturation',
];

/**
 * Merge a partial parameter set over `base` (defaults unless given), then validate and clamp.
 * Pure. Never throws for numbers (bad numbers fall back to `base` with a note); throws a
 * TypeError for an unknown `surface` or `blurKind`.
 */
export function resolveGlassParams(
  input: Partial<GlassParams> = {},
  base: GlassParams = DEFAULT_GLASS_PARAMS,
): ResolvedGlassParams {
  const p: GlassParams = { ...base };
  for (const k of GLASS_PARAM_KEYS) {
    const v = input[k];
    if (v !== undefined) (p as unknown as Record<string, unknown>)[k] = v;
  }
  const notes: string[] = [];

  if (!isSurfaceKind(p.surface)) throw new TypeError(`liquid-glass: unknown surface "${String(p.surface)}"`);
  if (!BLUR_KINDS.includes(p.blurKind)) throw new TypeError(`liquid-glass: unknown blurKind "${String(p.blurKind)}"`);
  p.specular = Boolean(p.specular);

  for (const k of NUMERIC_KEYS) {
    const v = p[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      notes.push(`${k}: ${String(v)} → ${base[k]} (not a finite number)`);
      p[k] = base[k];
    }
  }

  const clamp = (k: NumericKey, lo: number, hi: number, why: string) => {
    const v = p[k];
    const c = Math.min(hi, Math.max(lo, v));
    if (c !== v) {
      notes.push(`${k}: ${v} → ${c} (${why})`);
      p[k] = c;
    }
  };

  clamp('width', 1, Infinity, 'min 1');
  clamp('height', 1, Infinity, 'min 1');
  const halfMin = Math.floor(Math.min(p.width, p.height) / 2);
  clamp('radius', 0, halfMin, `max half the short side, ${halfMin}`);
  clamp('bezelWidth', 1, Math.max(1, halfMin), `1..${halfMin}`);
  clamp('refractiveIndex', 1, Infinity, 'min 1');
  clamp('glassThickness', 0, Infinity, 'min 0');
  clamp('displacementScale', 0, Infinity, 'min 0');
  clamp('chromaticBezelFraction', 0.001, 1, '0.001..1');
  clamp('dispersion', 0, Infinity, 'min 0');
  clamp('blur', 0, Infinity, 'min 0');
  clamp('specularStrength', 0, Infinity, 'min 0');
  clamp('tint', 0, 1, '0..1');
  clamp('saturation', 0, Infinity, 'min 0');

  const shape: ResolvedGlassParams['shape'] = p.width === p.height && p.radius * 2 >= p.width ? 'circle' : 'rect';
  return { ...p, shape, notes };
}

/** Keys whose change requires regenerating the displacement map. */
export const DISPLACEMENT_KEYS: readonly (keyof GlassParams)[] = [
  'width',
  'height',
  'radius',
  'bezelWidth',
  'surface',
  'refractiveIndex',
  'glassThickness',
  'chromaticBezelFraction',
];

/** Keys whose change requires regenerating the specular map. */
export const SPECULAR_KEYS: readonly (keyof GlassParams)[] = [
  'width',
  'height',
  'radius',
  'bezelWidth',
  'specular',
  'specularAngleDeg',
  'specularStrength',
];

/**
 * Translate 1.x parameter names (`GlassContainerParams`, element attributes) to `GlassParams`.
 * Keys that are undefined in the input are omitted from the output. By default the 1.x
 * thickness smoothstep is applied so a 1.x value renders the same (`thicknessCurve: false`
 * passes it through literally).
 */
export function fromLegacyParams(
  legacy: Partial<GlassContainerParams>,
  opts: { thicknessCurve?: boolean } = {},
): Partial<GlassParams> {
  const curve = opts.thicknessCurve ?? true;
  const out: Partial<GlassParams> = {};
  const copy = <K extends keyof GlassParams>(k: K, v: GlassParams[K] | undefined) => {
    if (v !== undefined) out[k] = v;
  };
  copy('width', legacy.width);
  copy('height', legacy.height);
  copy('radius', legacy.radius);
  copy('bezelWidth', legacy.bezelWidth);
  copy('surface', legacy.surface);
  copy('refractiveIndex', legacy.refractiveIndex);
  copy('glassThickness', legacy.glassThickness === undefined ? undefined : curve ? mapGlassThickness(legacy.glassThickness) : legacy.glassThickness);
  copy('displacementScale', legacy.scalePx);
  copy('chromaticBezelFraction', legacy.chromaticBezelFactor === undefined ? undefined : 1 / legacy.chromaticBezelFactor);
  copy('dispersion', legacy.dispersion);
  copy('blurKind', legacy.blurKind);
  copy('blur', legacy.blurStdDev);
  copy('specular', legacy.showSpecular);
  copy('specularAngleDeg', legacy.specularAngleDeg);
  copy('specularStrength', legacy.specularStrength);
  copy('tint', legacy.frost);
  copy('saturation', legacy.saturation);
  return out;
}
