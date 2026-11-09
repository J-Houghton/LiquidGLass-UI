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

const REFS = { id: 'lg-test', mapHref: 'blob:map', lightHref: 'blob:light' };

describe('buildFilterSpec', () => {
  for (const combo of COMBOS) {
    const label = `dispersion=${combo.dispersion} blur=${combo.blurKind} specular=${combo.specular}`;
    it(`${label}: spec is pinned`, () => {
      const spec = buildFilterSpec(resolveGlassParams({ ...combo, blur: 0.5, specularStrength: 1.1, displacementScale: 150 }), REFS);
      expect(spec).toMatchSnapshot();
    });
  }

  it('the static primitives are the two images, filling an objectBoundingBox region by default', () => {
    const spec = buildFilterSpec(resolveGlassParams({ width: 320, height: 200 }), { ...REFS, mapHref: 'blob:m', lightHref: 'blob:l' });
    expect(spec.static.map((p) => p.tag)).toEqual(['feImage', 'feImage']);
    expect(spec.static[0].attrs).toEqual({ preserveAspectRatio: 'none', href: 'blob:m', result: 'map' });
    expect(spec.static[1].attrs).toEqual({ preserveAspectRatio: 'none', href: 'blob:l', result: 'light' });
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
    const sums = spec.dynamic.filter((p) => p.tag === 'feComposite' && /^ch/.test(p.attrs.in));
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
    expect(gauss.find((p) => p.tag === 'feBlend' && p.attrs.in2 === 'rim')!.attrs.in).toBe('blurred');
  });

  it('rim stage: the light vector applied to the light map, one matrix per side, summed, screened', () => {
    const spec = buildFilterSpec(resolveGlassParams({ specularStrength: 0.81, specularAngleDeg: 60 }), REFS);
    const a = spec.dynamic.find((p) => p.tag === 'feColorMatrix' && p.attrs.result === 'rimA')!;
    const b = spec.dynamic.find((p) => p.tag === 'feColorMatrix' && p.attrs.result === 'rimB')!;
    // L = (cos 60°, sin 60°) = (0.5, 0.866); alpha = GAIN·s·(Lx r + Ly g) − s·b − BIAS·s·(Lx + Ly)
    // with GAIN = 255/127, BIAS = 128/127, s = 0.81: 0.8132 r + 1.4085 g − 0.81 b − 1.1152
    expect(a.attrs.in).toBe('light');
    expect(a.attrs.values).toBe('0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.8132 1.4085 -0.81 0 -1.1152');
    expect(b.attrs.values).toBe('0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -0.8132 -1.4085 -0.81 0 1.1152');
    const sum = spec.dynamic.find((p) => p.tag === 'feComposite' && p.attrs.result === 'rim')!;
    expect(sum.attrs).toMatchObject({ in: 'rimA', in2: 'rimB', operator: 'arithmetic', k2: '1', k3: '1' });
    expect(spec.dynamic.find((p) => p.tag === 'feBlend' && p.attrs.in2 === 'rim')!.attrs.mode).toBe('screen');
    expect(spec.dynamic.some((p) => p.tag === 'feComponentTransfer')).toBe(false);
  });

  it('the light angle changes only the two rim matrices (never the structure)', () => {
    const p60 = buildFilterSpec(resolveGlassParams({ specularAngleDeg: 60 }), REFS);
    const p135 = buildFilterSpec(resolveGlassParams({ specularAngleDeg: 135 }), REFS);
    expect(p135.structureKey).toBe(p60.structureKey);
    expect(p135.static).toEqual(p60.static);
    const diff = p60.dynamic.map((q, i) => (JSON.stringify(q) === JSON.stringify(p135.dynamic[i]) ? null : q.attrs.result)).filter(Boolean);
    expect(diff).toEqual(['rimA', 'rimB']);
    // 180° apart is the same lighting (|n·L|): the two sides swap
    const p240 = buildFilterSpec(resolveGlassParams({ specularAngleDeg: 240 }), REFS);
    const vals = (s: typeof p60, r: string) => s.dynamic.find((q) => q.attrs.result === r)!.attrs.values;
    expect(vals(p240, 'rimA')).toBe(vals(p60, 'rimB'));
    expect(vals(p240, 'rimB')).toBe(vals(p60, 'rimA'));
  });

  it('shade stage: black with alpha = shade x max(0, B − |lit rim|), multiplied in before the rim', () => {
    const none = buildFilterSpec(resolveGlassParams({ shade: 0 }), REFS);
    expect(none.dynamic.some((p) => p.attrs.result === 'shade')).toBe(false);
    expect(none.dynamic.some((p) => p.attrs.result === 'lit')).toBe(false);
    const spec = buildFilterSpec(resolveGlassParams({ shade: 0.5, specularAngleDeg: 60 }), REFS);
    const names = spec.dynamic.map((p) => p.attrs.result);
    expect(names.slice(names.indexOf('litA'), names.indexOf('shaded') + 1)).toEqual(['litA', 'litB', 'lit', 'shadeFull', 'shade', 'shaded']);
    const litA = spec.dynamic.find((p) => p.attrs.result === 'litA')!;
    expect(litA.attrs.values).toBe('0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.0039 1.7389 0 0 -1.3768'); // unit strength, no shade term
    const full = spec.dynamic.find((p) => p.attrs.result === 'shadeFull')!;
    expect(full.attrs.in).toBe('light');
    expect(full.attrs.values).toBe('0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0.5 0 0');
    const shade = spec.dynamic.find((p) => p.attrs.result === 'shade')!;
    expect(shade.attrs).toMatchObject({ in: 'shadeFull', in2: 'lit', operator: 'arithmetic', k2: '1', k3: '-0.5' });
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

  describe('region (content-side filter: url())', () => {
    const REGION = { x: 40, y: 30.5, width: 300, height: 120 };
    const LENS = { x: '40', y: '30.5', width: '300', height: '120' };

    for (const dispersion of [0, 1]) {
      it(`dispersion=${dispersion}: spec is pinned`, () => {
        const spec = buildFilterSpec(resolveGlassParams({ dispersion, blur: 0.5, shade: 0.3, saturation: 1.2 }), REFS, { region: REGION });
        expect(spec).toMatchSnapshot();
      });
    }

    it('confines the map and every lens stage to the region, then saturates, cuts out and composites', () => {
      const spec = buildFilterSpec(resolveGlassParams({ dispersion: 1, shade: 0.3, saturation: 1.2 }), REFS, { region: REGION });
      expect(spec.static[0].attrs).toEqual({ ...LENS, preserveAspectRatio: 'none', href: 'blob:map', result: 'map' });
      const tail = spec.dynamic.slice(-4);
      expect(tail.map((q) => q.tag)).toEqual(['feColorMatrix', 'feFlood', 'feComposite', 'feComposite']);
      expect(tail[0].attrs).toEqual({ ...LENS, in: 'final', type: 'saturate', values: '1.2', result: 'lens' });
      expect(tail[1].attrs).toEqual({ ...LENS, 'flood-color': '#000', result: 'hole' });
      expect(tail[2].attrs).toEqual({ in: 'SourceGraphic', in2: 'hole', operator: 'out', result: 'ground' });
      expect(tail[3].attrs).toEqual({ in: 'lens', in2: 'ground', operator: 'over', result: 'composed' });
      for (const q of spec.dynamic.slice(0, -2)) expect(q.attrs).toMatchObject(LENS);
      expect(spec.structureKey).toBe(buildFilterSpec(resolveGlassParams({ dispersion: 1, shade: 0.3, blurStage: 'before' }), REFS).structureKey + '|content');
      expect(filterElementAttrs(spec)).toMatchObject({ filterUnits: 'objectBoundingBox', width: '1', height: '1' });
    });

    it('moving the lens changes only x and y on the confined primitives; padding is ignored', () => {
      const p = resolveGlassParams({ dispersion: 1, shade: 0.3 });
      const a = buildFilterSpec(p, REFS, { region: REGION, padding: 24 });
      const b = buildFilterSpec(p, REFS, { region: { ...REGION, x: 100, y: 80 } });
      expect(a.padding).toBe(0);
      expect(a.structureKey).toBe(b.structureKey);
      const all = (s: typeof a) => [...s.static, ...s.dynamic];
      const changed: string[] = [];
      all(a).forEach((q, i) => {
        for (const k of Object.keys(q.attrs)) if (q.attrs[k] !== all(b)[i].attrs[k]) changed.push(k);
      });
      expect(new Set(changed)).toEqual(new Set(['x', 'y']));
      expect(changed).toHaveLength(2 * (all(a).length - 2));
    });

    it('the saturate stage is the identity at saturation 1 and reads the last lens stage', () => {
      const spec = buildFilterSpec(resolveGlassParams({ specular: false }), REFS, { region: REGION });
      const sat = spec.dynamic.find((q) => q.attrs.type === 'saturate')!;
      expect(sat.attrs.values).toBe('1');
      expect(sat.attrs.in).toBe('refr');
    });

    it("always blurs before displacement (pinned opaque), whatever blurStage says", () => {
      for (const blurStage of ['after', 'before'] as const) {
        const spec = buildFilterSpec(resolveGlassParams({ blurStage, blur: 1 }), REFS, { region: REGION });
        expect(spec.dynamic.slice(0, 3).map((q) => q.tag)).toEqual(['feGaussianBlur', 'feColorMatrix', 'feDisplacementMap']);
        expect(spec.dynamic[0].attrs.in).toBe('SourceGraphic');
        expect(spec.dynamic[2].attrs.in).toBe('soft');
        expect(spec.structureKey).toContain('|before:gauss|');
      }
    });
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
