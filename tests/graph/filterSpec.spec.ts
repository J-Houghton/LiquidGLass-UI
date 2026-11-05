/**
 * Pins the pure filter spec. One map image (R,G displacement, B rim) feeds a displacement stage
 * (single pass, or three channel-isolated passes for dispersion), a blur stage and a rim stage.
 */
import { describe, it, expect } from 'vitest';
import { buildFilterSpec, filterSpecToSvg, filterElementAttrs, DISPERSION_SPREAD } from '../../src/core/filters/spec';
import { resolveGlassParams, type BlurKind } from '../../src/core/params';

const COMBOS: { dispersion: number; blurKind: BlurKind; specular: boolean }[] = [];
for (const dispersion of [0, 1]) {
  for (const blurKind of ['gauss', 'noise1', 'noise2'] as BlurKind[]) {
    for (const specular of [false, true]) COMBOS.push({ dispersion, blurKind, specular });
  }
}

const REFS = { id: 'lg-test', mapHref: 'blob:map' };

describe('buildFilterSpec', () => {
  for (const combo of COMBOS) {
    const label = `dispersion=${combo.dispersion} blur=${combo.blurKind} specular=${combo.specular}`;
    it(`${label}: spec is pinned`, () => {
      const spec = buildFilterSpec(resolveGlassParams({ ...combo, blur: 0.5, specularStrength: 1.1, displacementScale: 150 }), REFS);
      expect(spec).toMatchSnapshot();
    });
  }

  it('the only static primitive is the map image', () => {
    const spec = buildFilterSpec(resolveGlassParams({ width: 320, height: 200 }), { ...REFS, mapHref: 'blob:m' });
    expect(spec.static.map((p) => p.tag)).toEqual(['feImage']);
    expect(spec.static[0].attrs).toMatchObject({ href: 'blob:m', width: '320', height: '200', result: 'map' });
    expect(spec.width).toBe(320);
    expect(spec.height).toBe(200);
    expect(spec.padding).toBe(0);
  });

  it('single displacement pass reads SourceGraphic through the map at displacementScale', () => {
    const spec = buildFilterSpec(resolveGlassParams({ displacementScale: 77 }), REFS);
    expect(spec.dynamic[0].tag).toBe('feDisplacementMap');
    expect(spec.dynamic[0].attrs).toMatchObject({ in: 'SourceGraphic', in2: 'map', xChannelSelector: 'R', yChannelSelector: 'G', scale: '77', result: 'refr' });
  });

  it('dispersion = three passes at 1-k, 1, 1+k times the scale, channel-isolated and summed', () => {
    const spec = buildFilterSpec(resolveGlassParams({ displacementScale: 100, dispersion: 2.5 }), REFS);
    const passes = spec.dynamic.filter((p) => p.tag === 'feDisplacementMap' && p.attrs.in === 'SourceGraphic');
    const k = DISPERSION_SPREAD * 2.5;
    expect(passes.map((p) => p.attrs.scale)).toEqual([String(100 * (1 - k)), '100', String(100 * (1 + k))]);
    expect(passes.map((p) => p.attrs.result)).toEqual(['dispR', 'dispG', 'dispB']);
    const matrices = spec.dynamic.filter((p) => p.tag === 'feColorMatrix' && /^disp[RGB]$/.test(p.attrs.in));
    expect(matrices).toHaveLength(3);
    const sums = spec.dynamic.filter((p) => p.tag === 'feComposite');
    expect(sums.map((p) => [p.attrs.in, p.attrs.in2, p.attrs.result])).toEqual([
      ['chR', 'chG', 'chRG'],
      ['chRG', 'chB', 'refr'],
    ]);
    for (const s of sums) expect(s.attrs).toMatchObject({ operator: 'arithmetic', k1: '0', k2: '1', k3: '1', k4: '0' });
  });

  it('structureKey depends only on the enabled stages', () => {
    const a = buildFilterSpec(resolveGlassParams({ dispersion: 1, blur: 0.1 }), REFS);
    const b = buildFilterSpec(resolveGlassParams({ dispersion: 3, blur: 2, specularStrength: 2 }), REFS);
    const c = buildFilterSpec(resolveGlassParams({ dispersion: 0 }), REFS);
    expect(a.structureKey).toBe(b.structureKey);
    expect(a.structureKey).not.toBe(c.structureKey);
    expect(a.dynamic.length).toBe(b.dynamic.length);
    expect(buildFilterSpec(resolveGlassParams({ specular: false }), REFS).structureKey).not.toBe(c.structureKey);
  });

  it('threads results: blur consumes the displacement output, the rim blend consumes the blur', () => {
    const spec = buildFilterSpec(resolveGlassParams({ dispersion: 1, blurKind: 'noise2', specular: true }), REFS);
    const d = spec.dynamic;
    const noise = d.find((p) => p.tag === 'feDisplacementMap' && p.attrs.in2 === 'quant_high')!;
    expect(noise.attrs.in).toBe('refr');
    expect(d[d.length - 1].attrs).toMatchObject({ in: 'refrNoise_high', in2: 'rim', mode: 'screen', result: 'final' });
    const gauss = buildFilterSpec(resolveGlassParams({ blurKind: 'gauss' }), REFS).dynamic;
    expect(gauss[1].attrs).toMatchObject({ in: 'refr', result: 'blurred' });
    expect(gauss[3].attrs.in).toBe('blurred');
  });

  it('rim stage lifts the map blue channel to white with alpha = strength x B, once', () => {
    const spec = buildFilterSpec(resolveGlassParams({ specularStrength: 0.81 }), REFS);
    const rim = spec.dynamic.find((p) => p.tag === 'feColorMatrix' && p.attrs.in === 'map')!;
    expect(rim.attrs.values).toBe('0 0 1 0 0  0 0 1 0 0  0 0 1 0 0  0 0 0.81 0 0');
    expect(rim.attrs.result).toBe('rim');
    expect(spec.dynamic.some((p) => p.tag === 'feComponentTransfer')).toBe(false);
  });

  it('noise scale follows blur x 20/40', () => {
    const spec = buildFilterSpec(resolveGlassParams({ blurKind: 'noise1', blur: 0.8 }), REFS);
    expect(spec.dynamic.find((p) => p.tag === 'feDisplacementMap' && p.attrs.in2 === 'quant_low')!.attrs.scale).toBe('16.00');
  });

  it('padding enlarges the filter region around the box but not the map image', () => {
    const spec = buildFilterSpec(resolveGlassParams({ width: 300, height: 120 }), REFS, { padding: 24 });
    expect(filterElementAttrs(spec)).toMatchObject({ x: '-24', y: '-24', width: '348', height: '168' });
    expect(spec.static[0].attrs).toMatchObject({ x: '0', y: '0', width: '300', height: '120' });
    expect(buildFilterSpec(resolveGlassParams(), REFS, { padding: -5 }).padding).toBe(0);
  });

  it('serializes to well-formed, escaped SVG markup', () => {
    const spec = buildFilterSpec(resolveGlassParams({ dispersion: 1 }), { ...REFS, mapHref: 'data:x/y;base64,AA==&"<' });
    const svg = filterSpecToSvg(spec);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('<filter id="lg-test" filterUnits="userSpaceOnUse"');
    expect(svg).toContain('href="data:x/y;base64,AA==&amp;&quot;&lt;"');
    expect(svg).toContain('<feBlend in="blurred" in2="rim" mode="screen" result="final"/>');
    expect((svg.match(/<filter/g) ?? []).length).toBe(1);
    expect(svg.endsWith('</filter></defs></svg>')).toBe(true);
    expect(svg).toMatchSnapshot();
  });
});
