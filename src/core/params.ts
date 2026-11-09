import { isSurfaceKind, type SurfaceKind } from './optics/surfaces.js';
import { mapGlassThickness } from './validation/geometry.js';

export type BlurKind = 'gauss' | 'noise1' | 'noise2';
export const BLUR_KINDS: readonly BlurKind[] = ['gauss', 'noise1', 'noise2'];

/** Where the blur sits in the graph: on the backdrop before displacement, or on the refracted result. */
export type BlurStage = 'before' | 'after';
export const BLUR_STAGES: readonly BlurStage[] = ['before', 'after'];

/** How `dispersion` is read: a share of the displacement scale, or a fixed number of pixels. */
export type DispersionUnit = 'relative' | 'px';
export const DISPERSION_UNITS: readonly DispersionUnit[] = ['relative', 'px'];

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
  /**
   * Use the physical maximum displacement the optics produce instead of `displacementScale`,
   * so IOR and thickness set the on-screen strength (kube.io's convention).
   */
  physicalScale: boolean;
  /**
   * Chromatic dispersion (three displacement passes). 0 disables the stage. Its meaning depends
   * on `dispersionUnit`: `'relative'` displaces red and blue at `1 ∓ 0.02·dispersion` times the
   * green scale (the fringe grows with the lens); `'px'` displaces them `∓ dispersion` px from
   * green (a fringe of fixed width, hyalite's convention).
   */
  dispersion: number;
  dispersionUnit: DispersionUnit;
  /**
   * Magnification, px: the lens also zooms in on what is behind it, as a magnifying glass does
   * (kube.io's lens). The backdrop at the lens's edge is drawn from this far in toward its middle
   * (in proportion on the shorter side), so a lens `w` wide zooms by `w / (w − magnify)`. A graph
   * attribute, so it can move every frame. 0 (default) leaves the stage out.
   */
  magnify: number;
  // look
  blurKind: BlurKind;
  /**
   * Where the blur sits in the filter graph.
   * - 'after' (default): the refracted image is blurred, so the rim highlight's edges and the
   *   dispersion fringe soften along with the backdrop.
   * - 'before': the backdrop is blurred first (alpha pinned to opaque), then displaced, so the
   *   rim and the colour fringe stay crisp while the interior is soft (hyalite, PallavAg and
   *   samasante do this).
   * At the default `blur` of 0.2 px the two are indistinguishable: the difference only shows once
   * `blur` is around 1 px or more, and is most visible with `dispersion` > 0 over high-contrast
   * backdrops. Compare live in the playground ("Compare (A/B twin)") or with `demo/visual.html`.
   */
  blurStage: BlurStage;
  /** Blur amount: Gaussian standard deviation, or noise displacement scale for noise kinds. */
  blur: number;
  specular: boolean;
  specularAngleDeg: number;
  /** Rim-light brightness; applied once, in the filter. */
  specularStrength: number;
  /**
   * Edge darkening, 0..1: how dark the glass gets where the lens thins the backdrop the most
   * (the steepest part of the bezel profile, just inside the rim), fading to nothing where the
   * glass is flat. Reads as the thickness of the edge. 0 (default) disables the stage.
   */
  shade: number;
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
  physicalScale: false,
  dispersion: 0,
  dispersionUnit: 'relative',
  magnify: 0,
  blurKind: 'gauss',
  blurStage: 'after',
  blur: 0.2,
  specular: true,
  specularAngleDeg: 60,
  specularStrength: 0.81, // the 1.x 0.9, which 1.x applied twice
  shade: 0,
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
  'dispersion',
  'magnify',
  'blur',
  'specularAngleDeg',
  'specularStrength',
  'shade',
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
  if (!BLUR_STAGES.includes(p.blurStage)) throw new TypeError(`liquid-glass: unknown blurStage "${String(p.blurStage)}"`);
  if (!DISPERSION_UNITS.includes(p.dispersionUnit)) throw new TypeError(`liquid-glass: unknown dispersionUnit "${String(p.dispersionUnit)}"`);
  p.specular = Boolean(p.specular);
  p.physicalScale = Boolean(p.physicalScale);

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
  clamp('dispersion', 0, p.dispersionUnit === 'px' ? 64 : 50, p.dispersionUnit === 'px' ? '0..64 px' : '0..50');
  clamp('magnify', 0, Infinity, 'min 0');
  clamp('blur', 0, Infinity, 'min 0');
  clamp('specularStrength', 0, Infinity, 'min 0');
  clamp('shade', 0, 1, '0..1');
  clamp('tint', 0, 1, '0..1');
  clamp('saturation', 0, Infinity, 'min 0');

  const shape: ResolvedGlassParams['shape'] = p.width === p.height && p.radius * 2 >= p.width ? 'circle' : 'rect';
  return { ...p, shape, notes };
}

/** Keys whose change requires regenerating the maps (geometry and optics; the light angle is a graph attribute). */
export const MAP_KEYS: readonly (keyof GlassParams)[] = [
  'width',
  'height',
  'radius',
  'bezelWidth',
  'surface',
  'refractiveIndex',
  'glassThickness',
];

/** The 1.x parameter names (`GlassContainerParams`), kept only for `fromLegacyParams`. */
export interface LegacyGlassParams {
  width: number;
  height: number;
  radius: number;
  bezelWidth: number;
  glassThickness: number;
  surface: SurfaceKind;
  refractiveIndex: number;
  scalePx: number;
  blurKind: BlurKind;
  blurStdDev: number;
  showSpecular: boolean;
  specularAngleDeg: number;
  specularStrength: number;
  dispersion: number;
  /** 1.x chromatic edge mask width. Dispersion no longer uses a mask; the value is ignored. */
  chromaticBezelFactor: number;
  frost: number;
  saturation: number;
}

/**
 * Translate 1.x parameter names (`GlassContainerParams`, element attributes) to `GlassParams`.
 * Keys that are undefined in the input are omitted from the output. By default the 1.x
 * thickness smoothstep is applied so a 1.x value renders the same (`thicknessCurve: false`
 * passes it through literally). 1.x applied `specularStrength` twice (once clamped into the
 * image, once as the filter slope), so `s` becomes `s · min(1, s)`.
 */
export function fromLegacyParams(
  legacy: Partial<LegacyGlassParams>,
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
  copy('dispersion', legacy.dispersion);
  copy('blurKind', legacy.blurKind);
  copy('blur', legacy.blurStdDev);
  copy('specular', legacy.showSpecular);
  copy('specularAngleDeg', legacy.specularAngleDeg);
  copy('specularStrength', legacy.specularStrength === undefined ? undefined : legacy.specularStrength * Math.min(1, legacy.specularStrength));
  copy('tint', legacy.frost);
  copy('saturation', legacy.saturation);
  return out;
}
