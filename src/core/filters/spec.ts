import type { BlurKind, DispersionUnit, ResolvedGlassParams } from '../params.js';

/**
 * Pure description of the SVG filter graph. The DOM layer materializes it into elements;
 * `filterSpecToSvg` serializes it to markup. No DOM types in here.
 *
 * One image feeds everything: R,G = displacement, B = rim light. Stages, in order:
 *   blurStage 'after':  displacement → blur → rim
 *   blurStage 'before': blur(SourceGraphic) → pin alpha → displacement → rim
 * where displacement is 1 pass, or 3 channel-isolated passes at staggered scales for dispersion.
 * With `region` (content-side `filter: url()`), the stages are confined to the lens rectangle and
 * the chain ends: saturate → hole in the source → lens over source.
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

/** A rectangle in the filtered element's border-box coordinates, CSS px. */
export interface LensRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FilterSpecOptions {
  /** Extra filter region around the element box, px. Default 0. Ignored with `region`. */
  padding?: number;
  /**
   * Content-side mode: the graph is meant for `filter: url()` on an element that owns the pixels
   * (the cross-engine route; `backdrop-filter: url()` renders only in Chromium), and the lens
   * occupies this rectangle of that element's box. Every lens primitive is confined to it, the
   * blur runs before displacement whatever `blurStage` says (see the note in `buildFilterSpec`),
   * the lens is saturated in-graph, and the chain ends by cutting the lens out of the source and
   * compositing the refracted lens over it, so the rest of the element passes through untouched.
   * Moving the lens changes only these four attributes on each primitive.
   */
  region?: LensRegion;
}

/** Displacement scale per unit of blur for the two noise profiles. */
export const NOISE_SCALE_FACTOR = { noise1: 20, noise2: 40 } as const;

/** Relative scale spread between red and blue per unit of `dispersion`. */
export const DISPERSION_SPREAD = 0.02;

const prim = (tag: string, attrs: Record<string, string>, children?: FilterPrimitive[]): FilterPrimitive =>
  children ? { tag, attrs, children } : { tag, attrs };

const num = (v: number): string => String(Math.round(v * 1000) / 1000);

export function buildFilterSpec(p: ResolvedGlassParams, refs: FilterRefs, opts: FilterSpecOptions = {}): FilterSpec {
  const region = opts.region ?? null;
  const padding = region ? 0 : Math.max(0, opts.padding ?? 0);
  // Without padding the filter region is the element's box in objectBoundingBox units and the
  // map image has no subregion, so it fills whatever the box is right now: a resized element
  // keeps a (stretched) lens while the sharper map is still encoding, and nothing size-dependent
  // has to be rewritten on the graph. With padding the region is explicit px (see filterElementAttrs).
  // In content-side mode the map (and every lens primitive) is confined to the lens rectangle.
  const lens: Record<string, string> = region
    ? { x: num(region.x), y: num(region.y), width: num(region.width), height: num(region.height) }
    : {};
  const staticPrims: FilterPrimitive[] = [
    region
      ? prim('feImage', { ...lens, preserveAspectRatio: 'none', href: refs.mapHref, result: 'map' })
      : padding > 0
        ? prim('feImage', { x: '0', y: '0', width: String(p.width), height: String(p.height), preserveAspectRatio: 'none', href: refs.mapHref, result: 'map' })
        : prim('feImage', { preserveAspectRatio: 'none', href: refs.mapHref, result: 'map' }),
  ];

  let dynamic: FilterPrimitive[] = [];
  const chromatic = p.dispersion > 0;
  // Content-side mode always blurs first: a blur after displacement would read transparent pixels
  // beyond the lens rectangle and feather its edge, and the hole punched into the source below
  // would show through that feather as an outline. Blurring the (pinned-opaque) source keeps the
  // lens opaque to its rectangle, so the cut-out is exact.
  const before = region !== null || p.blurStage === 'before';

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

  dynamic.push(
    ...(chromatic
      ? dispersionStage(source, p.displacementScale, p.dispersion, p.dispersionUnit)
      : displacementStage(source, p.displacementScale)),
  );

  let input = 'refr';
  if (!before) {
    const blurred = blurStage(input, p.blurKind, p.blur);
    dynamic.push(...blurred.prims);
    input = blurred.result;
  }
  const shade = p.shade;
  if (shade > 0) {
    dynamic.push(...shadeStage(input, shade));
    input = 'shaded';
  }
  if (p.specular) {
    dynamic.push(...rimStage(input, p.specularStrength));
    input = 'final';
  }

  if (region) {
    // Confine the lens stages to the lens rectangle (a primitive's subregion clips its output;
    // blur and displacement still read source pixels from just outside it, which is better than
    // the backdrop path gets). Then: lens saturation, a hole punched into the source where the
    // lens sits (so translucent content is not drawn twice), and the lens over the rest.
    dynamic = dynamic.map((q) => ({ ...q, attrs: { ...lens, ...q.attrs } }));
    dynamic.push(
      prim('feColorMatrix', { ...lens, in: input, type: 'saturate', values: num(p.saturation), result: 'lens' }),
      prim('feFlood', { ...lens, 'flood-color': '#000', result: 'hole' }),
      prim('feComposite', { in: 'SourceGraphic', in2: 'hole', operator: 'out', result: 'ground' }),
      prim('feComposite', { in: 'lens', in2: 'ground', operator: 'over', result: 'composed' }),
    );
  }

  return {
    id: refs.id,
    width: p.width,
    height: p.height,
    padding,
    static: staticPrims,
    dynamic,
    structureKey:
      `${chromatic ? 'dispersion' : 'single'}|${before ? 'before' : 'after'}:${p.blurKind}|${shade > 0 ? 'shade' : '-'}|${p.specular ? 'rim' : '-'}|pad:${padding > 0 ? 'px' : 'box'}` +
      (region ? '|content' : ''),
  };
}

/**
 * Attributes of the <filter> element itself. Primitive units are always user space (CSS px, so
 * `scale` is in px). The region is the element box in objectBoundingBox units, or explicit px
 * when a padding is requested.
 */
export function filterElementAttrs(spec: FilterSpec): Record<string, string> {
  const pad = spec.padding;
  if (pad > 0) {
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
  return {
    id: spec.id,
    filterUnits: 'objectBoundingBox',
    primitiveUnits: 'userSpaceOnUse',
    x: '0',
    y: '0',
    width: '1',
    height: '1',
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
 * is opaque). The fringe is radial; it scales with the lens in 'relative' units and has a fixed
 * width in 'px' units.
 */
function dispersionStage(source: string, scale: number, dispersion: number, unit: DispersionUnit): FilterPrimitive[] {
  const spread = unit === 'px' ? dispersion : scale * DISPERSION_SPREAD * dispersion;
  return [
    displace(source, Math.max(0, scale - spread), 'dispR'),
    prim('feColorMatrix', { in: 'dispR', type: 'matrix', values: KEEP_R, result: 'chR' }),
    displace(source, scale, 'dispG'),
    prim('feColorMatrix', { in: 'dispG', type: 'matrix', values: KEEP_G, result: 'chG' }),
    displace(source, scale + spread, 'dispB'),
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

// The blue channel is signed around 128: light above, shade below. In normalized terms
// (b = B/255) the light amount is (255b − 128)/127 and the shade amount is (128 − 255b)/127;
// feColorMatrix clamps negative alpha to 0, which separates the two halves.
const B_GAIN = 255 / 127;
const B_BIAS = 128 / 127;
const num4 = (v: number): string => String(Math.round(v * 10000) / 10000);

/**
 * Rim light: white with alpha = strength × light, screened over the refracted image. Strength is
 * applied here only.
 */
function rimStage(input: string, strength: number): FilterPrimitive[] {
  return [
    prim('feColorMatrix', {
      in: 'map',
      type: 'matrix',
      values: `0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 ${num4(B_GAIN * strength)} 0 ${num4(-B_BIAS * strength)}`,
      result: 'rim',
    }),
    prim('feBlend', { in: input, in2: 'rim', mode: 'screen', result: 'final' }),
  ];
}

/**
 * Shade: black with alpha = k × (B below neutral), multiplied into the refracted image, which
 * darkens an opaque backdrop by that alpha. k is the `shade` parameter: the darkening where the
 * lens thins the backdrop the most.
 */
function shadeStage(input: string, k: number): FilterPrimitive[] {
  return [
    prim('feColorMatrix', {
      in: 'map',
      type: 'matrix',
      values: `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 ${num4(-B_GAIN * k)} 0 ${num4(B_BIAS * k)}`,
      result: 'shade',
    }),
    prim('feBlend', { in: input, in2: 'shade', mode: 'multiply', result: 'shaded' }),
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
