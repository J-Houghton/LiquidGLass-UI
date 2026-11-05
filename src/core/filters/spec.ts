import type { BlurKind, ResolvedGlassParams } from '../params.js';

/**
 * Pure description of the SVG filter graph. The DOM layer materializes it into elements;
 * `filterSpecToSvg` serializes it to markup. No DOM types in here.
 *
 * One image feeds everything: R,G = displacement, B = rim light. Stages, in order:
 *   displacement (1 pass, or 3 channel-isolated passes at staggered scales for dispersion)
 *   → blur (Gaussian or noise) → rim light (B lifted to white-with-alpha, screen-blended).
 */

export interface FilterPrimitive {
  tag: string;
  attrs: Readonly<Record<string, string>>;
  children?: readonly FilterPrimitive[];
}

export interface FilterSpec {
  id: string;
  width: number;
  height: number;
  /** Filter region padding around the element box, px (output is still clipped to the box). */
  padding: number;
  /** The map image: always present, always first. */
  static: readonly FilterPrimitive[];
  /** Displacement → blur → rim stages, only those enabled. */
  dynamic: readonly FilterPrimitive[];
  /** Same key ⇒ same primitive sequence; only attribute values may differ. */
  structureKey: string;
}

export interface FilterRefs {
  id: string;
  mapHref: string;
}

export interface FilterSpecOptions {
  /** Extra filter region around the element box, px. Default 0. */
  padding?: number;
}

/** Displacement scale per unit of blur for the two noise profiles. */
export const NOISE_SCALE_FACTOR = { noise1: 20, noise2: 40 } as const;

/** Relative scale spread between red and blue per unit of `dispersion`. */
export const DISPERSION_SPREAD = 0.02;

const prim = (tag: string, attrs: Record<string, string>, children?: FilterPrimitive[]): FilterPrimitive =>
  children ? { tag, attrs, children } : { tag, attrs };

const num = (v: number): string => String(Math.round(v * 1000) / 1000);

export function buildFilterSpec(p: ResolvedGlassParams, refs: FilterRefs, opts: FilterSpecOptions = {}): FilterSpec {
  const w = String(p.width);
  const h = String(p.height);
  const staticPrims: FilterPrimitive[] = [
    prim('feImage', { x: '0', y: '0', width: w, height: h, preserveAspectRatio: 'none', href: refs.mapHref, result: 'map' }),
  ];

  const dynamic: FilterPrimitive[] = [];
  const chromatic = p.dispersion > 0;
  dynamic.push(...(chromatic ? dispersionStage(p.displacementScale, p.dispersion) : displacementStage(p.displacementScale)));
  let input = 'refr';
  dynamic.push(...blurStage(input, p.blurKind, p.blur));
  input = p.blurKind === 'gauss' ? 'blurred' : `refrNoise_${noiseSuffix(p.blurKind)}`;
  if (p.specular) dynamic.push(...rimStage(input, p.specularStrength));

  return {
    id: refs.id,
    width: p.width,
    height: p.height,
    padding: Math.max(0, opts.padding ?? 0),
    static: staticPrims,
    dynamic,
    structureKey: `${chromatic ? 'dispersion' : 'single'}|${p.blurKind}|${p.specular ? 'rim' : '-'}`,
  };
}

/** Attributes of the <filter> element itself. */
export function filterElementAttrs(spec: FilterSpec): Record<string, string> {
  const pad = spec.padding;
  return {
    id: spec.id,
    filterUnits: 'userSpaceOnUse',
    primitiveUnits: 'userSpaceOnUse',
    x: num(-pad),
    y: num(-pad),
    width: num(spec.width + 2 * pad),
    height: num(spec.height + 2 * pad),
    'color-interpolation-filters': 'sRGB',
  };
}

// ---- stages -------------------------------------------------------------------------------

const displace = (scale: number, result: string): FilterPrimitive =>
  prim('feDisplacementMap', {
    in: 'SourceGraphic',
    in2: 'map',
    xChannelSelector: 'R',
    yChannelSelector: 'G',
    scale: num(scale),
    result,
  });

function displacementStage(scale: number): FilterPrimitive[] {
  return [displace(scale, 'refr')];
}

const KEEP_R = '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0';
const KEEP_G = '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0';
const KEEP_B = '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0';

/**
 * Chromatic dispersion as three displacement passes: red at a slightly smaller scale, blue at
 * a slightly larger one, each channel isolated and the three summed (valid because the backdrop
 * is opaque). The fringe is radial and scales with the lens.
 */
function dispersionStage(scale: number, dispersion: number): FilterPrimitive[] {
  const k = DISPERSION_SPREAD * dispersion;
  return [
    displace(scale * (1 - k), 'dispR'),
    prim('feColorMatrix', { in: 'dispR', type: 'matrix', values: KEEP_R, result: 'chR' }),
    displace(scale, 'dispG'),
    prim('feColorMatrix', { in: 'dispG', type: 'matrix', values: KEEP_G, result: 'chG' }),
    displace(scale * (1 + k), 'dispB'),
    prim('feColorMatrix', { in: 'dispB', type: 'matrix', values: KEEP_B, result: 'chB' }),
    prim('feComposite', { in: 'chR', in2: 'chG', operator: 'arithmetic', k1: '0', k2: '1', k3: '1', k4: '0', result: 'chRG' }),
    prim('feComposite', { in: 'chRG', in2: 'chB', operator: 'arithmetic', k1: '0', k2: '1', k3: '1', k4: '0', result: 'refr' }),
  ];
}

const noiseSuffix = (kind: BlurKind): 'low' | 'high' => (kind === 'noise1' ? 'low' : 'high');

function blurStage(input: string, kind: BlurKind, blur: number): FilterPrimitive[] {
  if (kind === 'gauss') {
    return [prim('feGaussianBlur', { in: input, stdDeviation: blur.toFixed(2), result: 'blurred' })];
  }
  const suffix = noiseSuffix(kind);
  const baseFrequency = kind === 'noise1' ? 0.035 : 0.4;
  const numOctaves = kind === 'noise1' ? 5 : 4;
  return [
    prim('feTurbulence', {
      type: 'fractalNoise',
      baseFrequency: String(baseFrequency),
      numOctaves: String(numOctaves),
      seed: '7',
      result: `noise_${suffix}`,
    }),
    prim('feColorMatrix', {
      in: `noise_${suffix}`,
      type: 'matrix',
      values: '1.8 0 0 0 -0.4  0 1.8 0 0 -0.4  0 0 1.8 0 -0.4  0 0 0 1 0',
      result: `quant_${suffix}`,
    }),
    prim('feDisplacementMap', {
      in: input,
      in2: `quant_${suffix}`,
      xChannelSelector: 'R',
      yChannelSelector: 'G',
      scale: (blur * NOISE_SCALE_FACTOR[kind]).toFixed(2),
      result: `refrNoise_${suffix}`,
    }),
  ];
}

/**
 * Rim light: lift the map's blue channel to white with alpha = strength × B and screen it over
 * the refracted image. Strength is applied here only.
 */
function rimStage(input: string, strength: number): FilterPrimitive[] {
  const s = num(strength);
  return [
    prim('feColorMatrix', { in: 'map', type: 'matrix', values: `0 0 1 0 0  0 0 1 0 0  0 0 1 0 0  0 0 ${s} 0 0`, result: 'rim' }),
    prim('feBlend', { in: input, in2: 'rim', mode: 'screen', result: 'final' }),
  ];
}

// ---- serialization ------------------------------------------------------------------------

const escapeAttr = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function primToSvg(p: FilterPrimitive): string {
  const attrs = Object.entries(p.attrs)
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join('');
  if (!p.children?.length) return `<${p.tag}${attrs}/>`;
  return `<${p.tag}${attrs}>${p.children.map(primToSvg).join('')}</${p.tag}>`;
}

/**
 * Serialize the spec to an inline `<svg>` carrying the `<filter>`. Useful for server-rendered
 * markup; the image href must then be a data URL or a real URL.
 */
export function filterSpecToSvg(spec: FilterSpec): string {
  const fa = Object.entries(filterElementAttrs(spec))
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join('');
  const body = [...spec.static, ...spec.dynamic].map(primToSvg).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true" focusable="false"` +
    ` style="position:absolute;width:0;height:0;overflow:hidden;pointer-events:none">` +
    `<defs><filter${fa}>${body}</filter></defs></svg>`
  );
}
