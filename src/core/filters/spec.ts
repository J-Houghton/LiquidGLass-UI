import type { BlurKind, ResolvedGlassParams } from '../params.js';

/**
 * Pure description of the SVG filter graph. The DOM layer materializes it into elements;
 * `filterSpecToSvg` serializes it to markup. No DOM types in here.
 *
 * One image feeds everything: R,G = displacement, B = rim light. Stages, in order:
 *   blurStage 'after':  displacement → blur → rim
 *   blurStage 'before': blur(SourceGraphic) → pin alpha → displacement → rim
 * where displacement is 1 pass, or 3 channel-isolated passes at staggered scales for dispersion.
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
  /** Blur / displacement / rim stages in graph order, only those enabled. */
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
  const before = p.blurStage === 'before';

  let source = 'SourceGraphic';
  if (before) {
    const blurred = blurStage('SourceGraphic', p.blurKind, p.blur);
    dynamic.push(...blurred.prims);
    // The blur sampled past the region edge, so edge pixels are translucent; pinned to opaque they
    // keep their (correctly averaged) colour instead of leaving a pale hairline after the
    // dispersion sum (hyalite's "rule 7").
    dynamic.push(prim('feColorMatrix', { in: blurred.result, type: 'matrix', values: OPAQUE, result: 'soft' }));
    source = 'soft';
  }

  dynamic.push(...(chromatic ? dispersionStage(source, p.displacementScale, p.dispersion) : displacementStage(source, p.displacementScale)));

  let input = 'refr';
  if (!before) {
    const blurred = blurStage(input, p.blurKind, p.blur);
    dynamic.push(...blurred.prims);
    input = blurred.result;
  }
  if (p.specular) dynamic.push(...rimStage(input, p.specularStrength));

  return {
    id: refs.id,
    width: p.width,
    height: p.height,
    padding: Math.max(0, opts.padding ?? 0),
    static: staticPrims,
    dynamic,
    structureKey: `${chromatic ? 'dispersion' : 'single'}|${p.blurStage}:${p.blurKind}|${p.specular ? 'rim' : '-'}`,
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

const OPAQUE = '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1';
const KEEP_R = '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0';
const KEEP_G = '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0';
const KEEP_B = '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0';

const displace = (source: string, scale: number, result: string): FilterPrimitive =>
  prim('feDisplacementMap', {
    in: source,
    in2: 'map',
    xChannelSelector: 'R',
    yChannelSelector: 'G',
    scale: num(scale),
    result,
  });

function displacementStage(source: string, scale: number): FilterPrimitive[] {
  return [displace(source, scale, 'refr')];
}

/**
 * Chromatic dispersion as three displacement passes: red at a slightly smaller scale, blue at
 * a slightly larger one, each channel isolated and the three summed (valid because the backdrop
 * is opaque). The fringe is radial and scales with the lens.
 */
function dispersionStage(source: string, scale: number, dispersion: number): FilterPrimitive[] {
  const k = DISPERSION_SPREAD * dispersion;
  return [
    displace(source, scale * (1 - k), 'dispR'),
    prim('feColorMatrix', { in: 'dispR', type: 'matrix', values: KEEP_R, result: 'chR' }),
    displace(source, scale, 'dispG'),
    prim('feColorMatrix', { in: 'dispG', type: 'matrix', values: KEEP_G, result: 'chG' }),
    displace(source, scale * (1 + k), 'dispB'),
    prim('feColorMatrix', { in: 'dispB', type: 'matrix', values: KEEP_B, result: 'chB' }),
    prim('feComposite', { in: 'chR', in2: 'chG', operator: 'arithmetic', k1: '0', k2: '1', k3: '1', k4: '0', result: 'chRG' }),
    prim('feComposite', { in: 'chRG', in2: 'chB', operator: 'arithmetic', k1: '0', k2: '1', k3: '1', k4: '0', result: 'refr' }),
  ];
}

const noiseSuffix = (kind: BlurKind): 'low' | 'high' => (kind === 'noise1' ? 'low' : 'high');

function blurStage(input: string, kind: BlurKind, blur: number): { prims: FilterPrimitive[]; result: string } {
  if (kind === 'gauss') {
    return { prims: [prim('feGaussianBlur', { in: input, stdDeviation: blur.toFixed(2), result: 'blurred' })], result: 'blurred' };
  }
  const suffix = noiseSuffix(kind);
  const baseFrequency = kind === 'noise1' ? 0.035 : 0.4;
  const numOctaves = kind === 'noise1' ? 5 : 4;
  const result = `refrNoise_${suffix}`;
  return {
    prims: [
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
        result,
      }),
    ],
    result,
  };
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
