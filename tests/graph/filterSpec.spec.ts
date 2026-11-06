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

  it('the only static primitive is the map image, filling an objectBoundingBox region by default', () => {
    const spec = buildFilterSpec(resolveGlassParams({ width: 320, height: 200 }), { ...REFS, mapHref: 'blob:m' });
    expect(spec.static.map((p) => p.tag)).toEqual(['feImage']);
    expect(spec.static[0].attrs).toEqual({ preserveAspectRatio: 'none', href: 'blob:m', result: 'map' });
    expect(spec.width).toBe(320);
    expect(spec.height).toBe(200);
    expect(spec.padding).toBe(0);
    expect(filterElementAttrs(spec)).toEqual({
      id: 'lg-test',
      filterUnits: 'objectBoundingBox',
      primitiveUnits: 'userSpaceOnUse',
      x: '0',
      y: '0',
      width: '1',
      height: '1',
      'color-interpolation-filters': 'sRGB',
    });
  });

  it('a size change alone changes nothing in the graph (the box follows the element)', () => {
    const a = buildFilterSpec(resolveGlassParams({ width: 300, height: 120 }), REFS);
    const b = buildFilterSpec(resolveGlassParams({ width: 500, height: 260 }), REFS);
    expect(b.static).toEqual(a.static);
    expect(b.dynamic).toEqual(a.dynamic);
    expect(filterElementAttrs(b)).toEqual(filterElementAttrs(a));
    expect(b.structureKey).toBe(a.structureKey);
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

  describe("blurStage 'before'", () => {
    for (const combo of [
      { dispersion: 0, blurKind: 'gauss' as BlurKind },
      { dispersion: 1, blurKind: 'gauss' as BlurKind },
      { dispersion: 0, blurKind: 'noise1' as BlurKind },
      { dispersion: 1, blurKind: 'noise2' as BlurKind },
    ]) {
      it(`dispersion=${combo.dispersion} blur=${combo.blurKind}: spec is pinned`, () => {
        const spec = buildFilterSpec(resolveGlassParams({ ...combo, blurStage: 'before', blur: 0.5 }), REFS);
        expect(spec).toMatchSnapshot();
      });
    }

    it('blurs SourceGraphic, pins alpha to 1, then displaces the opaque result', () => {
      const d = buildFilterSpec(resolveGlassParams({ blurStage: 'before', blur: 0.7 }), REFS).dynamic;
      expect(d[0].attrs).toMatchObject({ in: 'SourceGraphic', stdDeviation: '0.70', result: 'blurred' });
      expect(d[1].tag).toBe('feColorMatrix');
      expect(d[1].attrs).toMatchObject({ in: 'blurred', values: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1', result: 'soft' });
      expect(d[2].attrs).toMatchObject({ in: 'soft', in2: 'map', result: 'refr' });
      expect(d[d.length - 1].attrs).toMatchObject({ in: 'refr', in2: 'rim', result: 'final' });
      expect(d.filter((p) => p.tag === 'feGaussianBlur')).toHaveLength(1);
    });

    it('with dispersion all three passes read the pinned blur; noise blur also feeds displacement', () => {
      const d = buildFilterSpec(resolveGlassParams({ blurStage: 'before', dispersion: 1, blurKind: 'noise1' }), REFS).dynamic;
      const noise = d.find((p) => p.tag === 'feDisplacementMap' && p.attrs.in2 === 'quant_low')!;
      expect(noise.attrs.in).toBe('SourceGraphic');
      expect(d[d.indexOf(noise) + 1].attrs).toMatchObject({ in: 'refrNoise_low', result: 'soft' });
      const passes = d.filter((p) => p.tag === 'feDisplacementMap' && p.attrs.in2 === 'map');
      expect(passes).toHaveLength(3);
      for (const p of passes) expect(p.attrs.in).toBe('soft');
    });

    it('is a different structure from after', () => {
      const before = buildFilterSpec(resolveGlassParams({ blurStage: 'before' }), REFS);
      const after = buildFilterSpec(resolveGlassParams({ blurStage: 'after' }), REFS);
      expect(before.structureKey).not.toBe(after.structureKey);
      expect(before.dynamic.length).toBe(after.dynamic.length + 1); // the alpha pin
    });
  });

  it("dispersionUnit 'px' spreads red and blue by a fixed number of pixels, never below zero", () => {
    const spec = buildFilterSpec(resolveGlassParams({ displacementScale: 100, dispersion: 6, dispersionUnit: 'px' }), REFS);
    const passes = spec.dynamic.filter((p) => p.tag === 'feDisplacementMap' && p.attrs.in === 'SourceGraphic');
    expect(passes.map((p) => p.attrs.scale)).toEqual(['94', '100', '106']);
    const tiny = buildFilterSpec(resolveGlassParams({ displacementScale: 4, dispersion: 6, dispersionUnit: 'px' }), REFS);
    expect(tiny.dynamic[0].attrs.scale).toBe('0');
    expect(spec.structureKey).toBe(buildFilterSpec(resolveGlassParams({ displacementScale: 100, dispersion: 6 }), REFS).structureKey);
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

  it('rim stage: white with alpha = strength x (B above neutral), screened, once', () => {
    const spec = buildFilterSpec(resolveGlassParams({ specularStrength: 0.81 }), REFS);
    const rim = spec.dynamic.find((p) => p.tag === 'feColorMatrix' && p.attrs.result === 'rim')!;
    // (255b - 128)/127 x 0.81 = 1.6264 b - 0.8164
    expect(rim.attrs.values).toBe('0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 1.6264 0 -0.8164');
    expect(spec.dynamic.find((p) => p.tag === 'feBlend' && p.attrs.in2 === 'rim')!.attrs.mode).toBe('screen');
    expect(spec.dynamic.some((p) => p.tag === 'feComponentTransfer')).toBe(false);
  });

  it('shade stage: black with alpha = shade x (B below neutral), multiplied in before the rim', () => {
    const none = buildFilterSpec(resolveGlassParams({ shade: 0 }), REFS);
    expect(none.dynamic.some((p) => p.attrs.result === 'shade')).toBe(false);
    const spec = buildFilterSpec(resolveGlassParams({ shade: 1 }), REFS);
    const shade = spec.dynamic.find((p) => p.tag === 'feColorMatrix' && p.attrs.result === 'shade')!;
    // k = 1: (128 - 255b)/127 = -2.0079 b + 1.0079
    expect(shade.attrs.values).toBe('0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 -2.0079 0 1.0079');
    const blend = spec.dynamic.find((p) => p.tag === 'feBlend' && p.attrs.in2 === 'shade')!;
    expect(blend.attrs).toMatchObject({ in: 'blurred', mode: 'multiply', result: 'shaded' });
    expect(spec.dynamic.find((p) => p.tag === 'feBlend' && p.attrs.in2 === 'rim')!.attrs.in).toBe('shaded');
    expect(spec.structureKey).not.toBe(none.structureKey);
    expect(spec.structureKey).toBe(buildFilterSpec(resolveGlassParams({ shade: 0.3 }), REFS).structureKey);
  });

  it('noise scale follows blur x 20/40', () => {
    const spec = buildFilterSpec(resolveGlassParams({ blurKind: 'noise1', blur: 0.8 }), REFS);
    expect(spec.dynamic.find((p) => p.tag === 'feDisplacementMap' && p.attrs.in2 === 'quant_low')!.attrs.scale).toBe('16.00');
  });

  it('padding switches to an explicit px region around the box; the map image keeps the box', () => {
    const spec = buildFilterSpec(resolveGlassParams({ width: 300, height: 120 }), REFS, { padding: 24 });
    expect(filterElementAttrs(spec)).toMatchObject({ filterUnits: 'userSpaceOnUse', x: '-24', y: '-24', width: '348', height: '168' });
    expect(spec.static[0].attrs).toMatchObject({ x: '0', y: '0', width: '300', height: '120' });
    expect(buildFilterSpec(resolveGlassParams(), REFS, { padding: -5 }).padding).toBe(0);
    expect(spec.structureKey).not.toBe(buildFilterSpec(resolveGlassParams({ width: 300, height: 120 }), REFS).structureKey);
  });

  it('serializes to well-formed, escaped SVG markup', () => {
    const spec = buildFilterSpec(resolveGlassParams({ dispersion: 1 }), { ...REFS, mapHref: 'data:x/y;base64,AA==&"<' });
    const svg = filterSpecToSvg(spec);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('<filter id="lg-test" filterUnits="objectBoundingBox" primitiveUnits="userSpaceOnUse"');
    expect(svg).toContain('href="data:x/y;base64,AA==&amp;&quot;&lt;"');
    expect(svg).toContain('<feBlend in="blurred" in2="rim" mode="screen" result="final"/>');
    expect((svg.match(/<filter/g) ?? []).length).toBe(1);
    expect(svg.endsWith('</filter></defs></svg>')).toBe(true);
    expect(svg).toMatchSnapshot();
  });
});
