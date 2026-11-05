import type { BlurKind, ResolvedGlassParams } from '../params.js';

/**
 * Pure description of the SVG filter graph. The DOM layer materializes it into elements;
 * `filterSpecToSvg` serializes it to markup. No DOM types in here.
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
  /** Map image, main displacement, specular image: always present, in this order. */
  static: readonly FilterPrimitive[];
  /** Chromatic → blur → specular stages, only those enabled. */
  dynamic: readonly FilterPrimitive[];
  /** Same key ⇒ same primitive sequence; only attribute values may differ. */
  structureKey: string;
}

export interface FilterRefs {
  id: string;
  mapHref: string;
  specularHref: string;
}

/** 1×1 transparent GIF used for the specular source when the stage is off. */
export const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

/** Displacement scale per unit of blur for the two noise profiles. */
export const NOISE_SCALE_FACTOR = { noise1: 20, noise2: 40 } as const;

const prim = (tag: string, attrs: Record<string, string>, children?: FilterPrimitive[]): FilterPrimitive =>
  children ? { tag, attrs, children } : { tag, attrs };

export function buildFilterSpec(p: ResolvedGlassParams, refs: FilterRefs): FilterSpec {
  const w = String(p.width);
  const h = String(p.height);
  const staticPrims: FilterPrimitive[] = [
    prim('feImage', { x: '0', y: '0', width: w, height: h, preserveAspectRatio: 'none', href: refs.mapHref, result: 'map' }),
    prim('feDisplacementMap', {
      in: 'SourceGraphic',
      in2: 'map',
      xChannelSelector: 'R',
      yChannelSelector: 'G',
      scale: String(p.displacementScale),
      result: 'refr',
    }),
    prim('feImage', { x: '0', y: '0', width: '100%', height: '100%', preserveAspectRatio: 'none', href: refs.specularHref, result: 'specSrc' }),
  ];

  const dynamic: FilterPrimitive[] = [];
  let input = 'refr';
  const chromatic = p.dispersion > 0;
  if (chromatic) {
    dynamic.push(...chromaticStage(input, p.dispersion));
    input = 'chromaticFastOut';
  }
  dynamic.push(...blurStage(input, p.blurKind, p.blur));
  input = p.blurKind === 'gauss' ? 'blurred' : `refrNoise_${noiseSuffix(p.blurKind)}`;
  if (p.specular) {
    dynamic.push(...specularStage(input, p.specularStrength));
  }

  return {
    id: refs.id,
    width: p.width,
    height: p.height,
    static: staticPrims,
    dynamic,
    structureKey: `${chromatic ? 'chromatic' : '-'}|${p.blurKind}|${p.specular ? 'specular' : '-'}`,
  };
}

/** Attributes of the <filter> element itself. */
export function filterElementAttrs(spec: FilterSpec): Record<string, string> {
  return {
    id: spec.id,
    filterUnits: 'userSpaceOnUse',
    primitiveUnits: 'userSpaceOnUse',
    x: '0',
    y: '0',
    width: String(spec.width),
    height: String(spec.height),
    'color-interpolation-filters': 'sRGB',
  };
}

// ---- stages -------------------------------------------------------------------------------

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

function specularStage(input: string, strength: number): FilterPrimitive[] {
  return [
    prim('feComponentTransfer', { in: 'specSrc', result: 'specAdj' }, [
      prim('feFuncA', { type: 'linear', slope: String(strength) }),
    ]),
    prim('feBlend', { in: input, in2: 'specAdj', mode: 'screen', result: 'final' }),
  ];
}

/**
 * Chromatic aberration by lateral channel offsets, masked to the bezel by the displacement
 * map's blue channel (result `map`). Red shifts right, blue shifts left, green anchors.
 */
function chromaticStage(input: string, dispersion: number): FilterPrimitive[] {
  const offsetPx = dispersion * 2.0;
  const ALPHA = '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0';
  return [
    prim('feColorMatrix', { in: 'map', type: 'matrix', values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0', result: 'chromaticMask' }),
    prim('feColorMatrix', { in: input, type: 'matrix', values: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', result: 'fastR' }),
    prim('feColorMatrix', { in: input, type: 'matrix', values: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', result: 'fastG' }),
    prim('feColorMatrix', { in: input, type: 'matrix', values: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', result: 'fastB' }),
    prim('feOffset', { in: 'fastR', dx: offsetPx.toFixed(2), dy: '0', result: 'offR_shifted' }),
    prim('feOffset', { in: 'fastB', dx: (-offsetPx).toFixed(2), dy: '0', result: 'offB_shifted' }),
    prim('feComposite', { in: 'offR_shifted', in2: 'chromaticMask', operator: 'in', result: 'rBezel' }),
    prim('feComposite', { in: 'offB_shifted', in2: 'chromaticMask', operator: 'in', result: 'bBezel' }),
    prim('feComposite', { in: 'fastR', in2: 'chromaticMask', operator: 'out', result: 'rCenter' }),
    prim('feComposite', { in: 'fastB', in2: 'chromaticMask', operator: 'out', result: 'bCenter' }),
    prim('feComposite', { in: 'rBezel', in2: 'rCenter', operator: 'arithmetic', k1: '0', k2: '1', k3: '1', k4: '0', result: 'finalR' }),
    prim('feComposite', { in: 'bBezel', in2: 'bCenter', operator: 'arithmetic', k1: '0', k2: '1', k3: '1', k4: '0', result: 'finalB' }),
    prim('feBlend', { in: 'finalR', in2: 'fastG', mode: 'screen', result: 'fastRG' }),
    prim('feBlend', { in: 'fastRG', in2: 'finalB', mode: 'screen', result: 'fastRGB' }),
    prim('feColorMatrix', { in: input, type: 'matrix', values: ALPHA, result: 'fastA' }),
    prim('feComposite', { in: 'fastRGB', in2: 'fastA', operator: 'in', result: 'chromaticFastOut' }),
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
 * markup; the image hrefs must then be data URLs or real URLs.
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
