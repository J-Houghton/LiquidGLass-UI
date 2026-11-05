/**
 * Pins the pure filter spec. (The port from the Lit-era FilterGraph was proven primitive-for-
 * primitive by an equivalence test that lived here until the legacy code was deleted in
 * Phase 4.2; see git history, commit "Phase 2.1 + 2.3".)
 */
import { describe, it, expect } from 'vitest';
import { buildFilterSpec, filterSpecToSvg, TRANSPARENT_PIXEL } from '../../src/core/filters/spec';
import { resolveGlassParams, type BlurKind } from '../../src/core/params';

const COMBOS: { dispersion: number; blurKind: BlurKind; specular: boolean }[] = [];
for (const dispersion of [0, 1]) {
  for (const blurKind of ['gauss', 'noise1', 'noise2'] as BlurKind[]) {
    for (const specular of [false, true]) COMBOS.push({ dispersion, blurKind, specular });
  }
}

const REFS = { id: 'lg-test', mapHref: 'blob:map', specularHref: TRANSPARENT_PIXEL };

describe('buildFilterSpec', () => {
  for (const combo of COMBOS) {
    const label = `dispersion=${combo.dispersion} blur=${combo.blurKind} specular=${combo.specular}`;
    it(`${label}: spec is pinned`, () => {
      const spec = buildFilterSpec(resolveGlassParams({ ...combo, blur: 0.5, specularStrength: 1.1, displacementScale: 150 }), REFS);
      expect(spec).toMatchSnapshot();
    });
  }

  it('static primitives carry the hrefs, size and displacement scale', () => {
    const spec = buildFilterSpec(resolveGlassParams({ width: 320, height: 200, displacementScale: 77 }), { ...REFS, mapHref: 'blob:m', specularHref: 'blob:s' });
    expect(spec.static.map((p) => p.tag)).toEqual(['feImage', 'feDisplacementMap', 'feImage']);
    expect(spec.static[0].attrs).toMatchObject({ href: 'blob:m', width: '320', height: '200', result: 'map' });
    expect(spec.static[1].attrs).toMatchObject({ in: 'SourceGraphic', in2: 'map', scale: '77', result: 'refr' });
    expect(spec.static[2].attrs).toMatchObject({ href: 'blob:s', result: 'specSrc' });
    expect(spec.width).toBe(320);
    expect(spec.height).toBe(200);
  });

  it('structureKey depends only on the enabled stages', () => {
    const a = buildFilterSpec(resolveGlassParams({ dispersion: 1, blur: 0.1 }), REFS);
    const b = buildFilterSpec(resolveGlassParams({ dispersion: 3, blur: 2, specularStrength: 2 }), REFS);
    const c = buildFilterSpec(resolveGlassParams({ dispersion: 0 }), REFS);
    expect(a.structureKey).toBe(b.structureKey);
    expect(a.structureKey).not.toBe(c.structureKey);
    expect(a.dynamic.length).toBe(b.dynamic.length);
  });

  it('threads results: each dynamic stage consumes the previous output', () => {
    const spec = buildFilterSpec(resolveGlassParams({ dispersion: 1, blurKind: 'noise2', specular: true }), REFS);
    const d = spec.dynamic;
    expect(d[1].attrs.in).toBe('refr');
    expect(d[d.length - 3].attrs.in).toBe('chromaticFastOut'); // noise feDisplacementMap
    expect(d[d.length - 1].attrs.in).toBe('refrNoise_high'); // final blend
    expect(d[d.length - 1].attrs.result).toBe('final');
  });

  it('chromatic offsets scale with dispersion and noise scale with blur', () => {
    const spec = buildFilterSpec(resolveGlassParams({ dispersion: 1.5, blurKind: 'noise1', blur: 0.8 }), REFS);
    const offsets = spec.dynamic.filter((p) => p.tag === 'feOffset').map((p) => p.attrs.dx);
    expect(offsets).toEqual(['3.00', '-3.00']);
    const noise = spec.dynamic.find((p) => p.tag === 'feDisplacementMap')!;
    expect(noise.attrs.scale).toBe('16.00');
  });

  it('serializes to well-formed, escaped SVG markup', () => {
    const spec = buildFilterSpec(resolveGlassParams({ dispersion: 1 }), { ...REFS, mapHref: 'data:x/y;base64,AA==&"<' });
    const svg = filterSpecToSvg(spec);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('<filter id="lg-test" filterUnits="userSpaceOnUse"');
    expect(svg).toContain('href="data:x/y;base64,AA==&amp;&quot;&lt;"');
    expect(svg).toContain('<feComponentTransfer in="specSrc" result="specAdj"><feFuncA type="linear" slope="0.9"/></feComponentTransfer>');
    expect((svg.match(/<filter/g) ?? []).length).toBe(1);
    expect(svg.endsWith('</filter></defs></svg>')).toBe(true);
    expect(svg).toMatchSnapshot();
  });
});
