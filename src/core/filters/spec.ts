import type { BlurKind, DispersionUnit, ResolvedGlassParams } from '../params.js';
import { lightVector } from '../optics/rim.js';

/**
 * Pure description of the SVG filter graph. The DOM layer materializes it into elements;
 * `filterSpecToSvg` serializes it to markup. No DOM types in here.
 *
 * Two images feed everything: the displacement map (R,G = inward displacement) and the light
 * map (R,G = rim Gaussian × outward normal, B = shade), neither depending on the light
 * direction; the rim stage applies the light vector itself. Stages, in order:
 *   blurStage 'after':  displacement → blur → rim
 *   blurStage 'before': blur(SourceGraphic) → pin alpha → displacement → rim
 * where displacement is 1 pass, or 3 channel-isolated passes at staggered scales for dispersion.
 * With `region` (content-side `filter: url()`), the stages are confined to the lens rectangle and
 * the chain ends: saturate → hole in the source → lens over source.
 * With `lightLayer`, the lens stops after displacement and blur (no light map image either), and
 * `buildLightSpec` draws the shade and rim as a filter of their own, for a layer over the glass.
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
  /** The two images: the displacement map first, the light map second. */
  static: readonly FilterPrimitive[];
  /** Blur / displacement / rim stages in graph order, only those enabled. */
  dynamic: readonly FilterPrimitive[];
  /** Same key ⇒ same primitive sequence; only attribute values may differ. */
  structureKey: string;
}

export interface FilterRefs {
  id: string;
  /** The displacement map (`displacementMap` / `lensMaps().map`). */
  mapHref: string;
  /** The light map (`lightMap` / `lensMaps().light`). */
  lightHref: string;
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
  /**
   * Leave the shade and the rim (and the light map image they read) out of the lens graph: they
   * are drawn by `buildLightSpec` on a layer over the glass instead. A backdrop filter re-runs its
   * whole graph whenever anything behind the glass moves, so the lens is then a third of the
   * work, and the light only re-runs when the light moves. Ignored with `region`.
   */
  lightLayer?: boolean;
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
  const layered = !region && opts.lightLayer === true;
  const padding = region ? 0 : Math.max(0, opts.padding ?? 0);
  // Without padding the filter region is the element's box in objectBoundingBox units and the
  // map image has no subregion, so it fills whatever the box is right now: a resized element
  // keeps a (stretched) lens while the sharper map is still encoding, and nothing size-dependent
  // has to be rewritten on the graph. With padding the region is explicit px (see filterElementAttrs).
  // In content-side mode the map (and every lens primitive) is confined to the lens rectangle.
  const lens: Record<string, string> = region
    ? { x: num(region.x), y: num(region.y), width: num(region.width), height: num(region.height) }
    : {};
  const image = (href: string, result: string): FilterPrimitive =>
    region
      ? prim('feImage', { ...lens, preserveAspectRatio: 'none', href, result })
      : padding > 0
        ? prim('feImage', { x: '0', y: '0', width: String(p.width), height: String(p.height), preserveAspectRatio: 'none', href, result })
        : prim('feImage', { preserveAspectRatio: 'none', href, result });
  // with a light layer, nothing in the lens reads the light map, so it isn't drawn here at all
  const staticPrims: FilterPrimitive[] = layered ? [image(refs.mapHref, 'map')] : [image(refs.mapHref, 'map'), image(refs.lightHref, 'light')];

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
  const shade = layered ? 0 : p.shade;
  const specular = !layered && p.specular;
  const [lx, ly] = lightVector(p.specularAngleDeg);
  if (shade > 0) {
    dynamic.push(...shadeStage(input, shade, lx, ly));
    input = 'shaded';
  }
  if (specular) {
    dynamic.push(...rimStage(input, p.specularStrength, lx, ly));
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
      `${chromatic ? 'dispersion' : 'single'}|${before ? 'before' : 'after'}:${p.blurKind}|${shade > 0 ? 'shade' : '-'}|${specular ? 'rim' : '-'}|pad:${padding > 0 ? 'px' : 'box'}` +
      (region ? '|content' : '') +
      (layered ? '|layer' : ''),
  };
}

/**
 * The light layer: the shade and the lit rim as a filter of their own, for `filter: url()` on an
 * element over the glass whose content is the light map, stretched to the glass's box (see
 * `lightLayer`). They are the lens graph's own stages, reading the map from `SourceGraphic`. The
 * lens graph multiplies its shade into the refracted image and screens its rim over it; the shade
 * is black and the rim white, and for those, multiply and screen give the same as compositing them
 * over the top. So this graph ends with the rim over the shade, both see-through, and laid over
 * the glass it comes to the lens graph's result. Only matrix values depend on the light direction.
 *
 * The result is cut to the layer's own shape (its alpha). A layer with the glass's border radius
 * leaves its corners transparent, and the matrices would read a transparent pixel (R = G = 0) as a
 * fully lit rim; the lens never sees one, since its map covers the whole box and the browser clips
 * the backdrop to the corners afterwards. The cut does that clipping here, antialiased edge included.
 */
export function buildLightSpec(p: ResolvedGlassParams, id: string): FilterSpec {
  const [lx, ly] = lightVector(p.specularAngleDeg);
  const shade = p.shade > 0;
  const dynamic: FilterPrimitive[] = [];
  if (shade) dynamic.push(...litStage('SourceGraphic', lx, ly), ...shadeLayer('SourceGraphic', p.shade));
  if (p.specular) dynamic.push(...rimLayer('SourceGraphic', p.specularStrength, lx, ly));
  if (shade && p.specular) dynamic.push(prim('feComposite', { in: 'rim', in2: 'shade', operator: 'over', result: 'both' }));
  if (shade || p.specular) {
    const top = shade && p.specular ? 'both' : shade ? 'shade' : 'rim';
    dynamic.push(prim('feComposite', { in: top, in2: 'SourceAlpha', operator: 'in', result: 'light' }));
  } else {
    // neither: draw nothing (a filter with no primitives would show the light map itself)
    dynamic.push(prim('feFlood', { 'flood-opacity': '0', result: 'light' }));
  }
  return {
    id,
    width: p.width,
    height: p.height,
    padding: 0,
    static: [],
    dynamic,
    structureKey: `light|${shade ? 'shade' : '-'}|${p.specular ? 'rim' : '-'}`,
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

// The light map's R and G hold g·n with a 128 bias: in normalized terms (c = C/255) the
// component is (255c − 128)/127 = GAIN·c − BIAS. A colour matrix is linear, so (g·n)·L for a
// light vector L is GAIN·(Lx·r + Ly·g) − BIAS·(Lx + Ly); it clamps negative alpha to 0, which
// gives max(0, ·) for free. The rim is lit on both sides (|n·L|), hence one matrix per sign.
// B holds the shade profile (0..1 unsigned). Light and shade compete for the same pixels the way
// the former single signed channel made them: the lit rim is light − shade, the shade is
// shade − light, each clamped at 0, so the look is unchanged while the angle is free.
const B_GAIN = 255 / 127;
const B_BIAS = 128 / 127;
const num4 = (v: number): string => String(Math.round(v * 10000) / 10000);

/** Alpha row of a colour matrix on the light map: s·(±(g·n)·L − shadeWeight·shade). */
const lightRow = (sx: number, sy: number, shadeCoeff: number): string =>
  `0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${num4(B_GAIN * sx)} ${num4(B_GAIN * sy)} ${num4(shadeCoeff)} 0 ${num4(-B_BIAS * (sx + sy))}`;

/**
 * Rim light for the light vector (lx, ly): per side, white with alpha = max(0, strength × (±(g·n)·L
 * − shade)), the two sides summed (`rimLayer`) and screened over the refracted image. Strength is
 * applied here only, and the light direction lives in these attributes alone.
 */
function rimStage(input: string, strength: number, lx: number, ly: number): FilterPrimitive[] {
  return [...rimLayer('light', strength, lx, ly), prim('feBlend', { in: input, in2: 'rim', mode: 'screen', result: 'final' })];
}

/** The lit rim as a white layer, from the light map at `source`. */
function rimLayer(source: string, strength: number, lx: number, ly: number): FilterPrimitive[] {
  return [
    prim('feColorMatrix', { in: source, type: 'matrix', values: lightRow(strength * lx, strength * ly, -strength), result: 'rimA' }),
    prim('feColorMatrix', { in: source, type: 'matrix', values: lightRow(-strength * lx, -strength * ly, -strength), result: 'rimB' }),
    prim('feComposite', { in: 'rimA', in2: 'rimB', operator: 'arithmetic', k1: '0', k2: '1', k3: '1', k4: '0', result: 'rim' }),
  ];
}

/**
 * Shade: black with alpha = k × max(0, shade − |(g·n)·L|) (`litStage`, `shadeLayer`), multiplied
 * into the refracted image, which darkens an opaque backdrop by that alpha. k is the `shade`
 * parameter: the darkening where the lens thins the backdrop the most.
 */
function shadeStage(input: string, k: number, lx: number, ly: number): FilterPrimitive[] {
  return [
    ...litStage('light', lx, ly),
    ...shadeLayer('light', k),
    prim('feBlend', { in: input, in2: 'shade', mode: 'multiply', result: 'shaded' }),
  ];
}

/**
 * How lit each point of the rim is, |(g·n)·L|, as white alpha: two unit-strength side matrices on
 * the light map at `source`, summed (at most one is non-zero per pixel).
 */
function litStage(source: string, lx: number, ly: number): FilterPrimitive[] {
  return [
    prim('feColorMatrix', { in: source, type: 'matrix', values: lightRow(lx, ly, 0), result: 'litA' }),
    prim('feColorMatrix', { in: source, type: 'matrix', values: lightRow(-lx, -ly, 0), result: 'litB' }),
    prim('feComposite', { in: 'litA', in2: 'litB', operator: 'arithmetic', k1: '0', k2: '1', k3: '1', k4: '0', result: 'lit' }),
  ];
}

/**
 * The shade as a black layer: the shade profile at strength k, less the lit rim (`lit`), with an
 * arithmetic composite whose colour channels clamp to black.
 */
function shadeLayer(source: string, k: number): FilterPrimitive[] {
  return [
    prim('feColorMatrix', {
      in: source,
      type: 'matrix',
      values: `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 ${num4(k)} 0 0`,
      result: 'shadeFull',
    }),
    prim('feComposite', { in: 'shadeFull', in2: 'lit', operator: 'arithmetic', k1: '0', k2: '1', k3: num4(-k), k4: '0', result: 'shade' }),
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
