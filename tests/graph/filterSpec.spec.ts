/**
 * The pure filter spec (Phase 2) must reproduce the legacy FilterGraph primitive by primitive.
 * The equivalence test compares against the live legacy builder; the snapshots pin the spec
 * on its own so the pin survives the legacy code's deletion in Phase 4.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { LitElement } from 'lit';
import { FilterGraph } from '../../src/components/filterGraph';
import { buildFilterSpec, filterSpecToSvg, TRANSPARENT_PIXEL, type FilterPrimitive } from '../../src/core/filters/spec';
import { resolveGlassParams, type BlurKind } from '../../src/core/params';
import { installFakeDom, SVG_NS, type FakeDocument, type FakeJson } from '../helpers/fakeDom';

const COMBOS: { dispersion: number; blurKind: BlurKind; specular: boolean }[] = [];
for (const dispersion of [0, 1]) {
  for (const blurKind of ['gauss', 'noise1', 'noise2'] as BlurKind[]) {
    for (const specular of [false, true]) COMBOS.push({ dispersion, blurKind, specular });
  }
}

const REFS = { id: 'lg-test', mapHref: 'blob:map', specularHref: TRANSPARENT_PIXEL };

/** Legacy static template, as in liquid-glass-filter.ts render(). */
function legacyHost(doc: FakeDocument, width: number, height: number) {
  const root = doc.createElement('div');
  const filter = doc.createElementNS(SVG_NS, 'filter');
  const set = (el: ReturnType<FakeDocument['createElementNS']>, attrs: Record<string, string>) => {
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };
  filter.append(
    set(doc.createElementNS(SVG_NS, 'feImage'), { x: '0', y: '0', width: String(width), height: String(height), preserveAspectRatio: 'none', result: 'map' }),
    set(doc.createElementNS(SVG_NS, 'feDisplacementMap'), { in: 'SourceGraphic', in2: 'map', xChannelSelector: 'R', yChannelSelector: 'G', scale: '0', result: 'refr' }),
    set(doc.createElementNS(SVG_NS, 'feImage'), { x: '0', y: '0', width: '100%', height: '100%', preserveAspectRatio: 'none', result: 'specSrc' }),
  );
  root.appendChild(filter);
  return { host: { renderRoot: root } as unknown as LitElement, filter };
}

const stripData = (j: FakeJson): FakeJson => ({
  tag: j.tag,
  attrs: Object.fromEntries(Object.entries(j.attrs).filter(([k]) => !k.startsWith('data-'))),
  ...(j.children ? { children: j.children.map(stripData) } : {}),
});
const primToJson = (p: FilterPrimitive, drop: string[] = []): FakeJson => ({
  tag: p.tag,
  attrs: Object.fromEntries(
    Object.entries(p.attrs)
      .filter(([k]) => !drop.includes(k))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  ),
  ...(p.children ? { children: p.children.map((c) => primToJson(c, drop)) } : {}),
});

describe('buildFilterSpec', () => {
  let doc: FakeDocument;
  let restore: () => void;
  beforeEach(() => {
    ({ document: doc, restore } = installFakeDom());
  });
  afterEach(() => restore());

  for (const combo of COMBOS) {
    const label = `dispersion=${combo.dispersion} blur=${combo.blurKind} specular=${combo.specular}`;

    it(`${label}: matches the legacy FilterGraph after build + update`, () => {
      const { host, filter } = legacyHost(doc, 300, 120);
      const graph = new FilterGraph(host);
      graph.hydrateRefs();
      graph.buildIfNeeded({ dispersion: combo.dispersion, blurKind: combo.blurKind, showSpecular: combo.specular, blurStdDev: 0.2, specularStrength: 0.9 });
      graph.updateParams({ blurStdDev: 0.5, blurKind: combo.blurKind, specularStrength: 1.1, scale_px: 150, dispersion: combo.dispersion });
      const legacy = filter.toJSON().children!.map(stripData);

      const spec = buildFilterSpec(
        resolveGlassParams({ ...combo, blur: 0.5, specularStrength: 1.1, displacementScale: 150, width: 300, height: 120 }),
        REFS,
      );
      const staticJson = spec.static.map((p) => primToJson(p, ['href']));
      const dynamicJson = spec.dynamic.map((p) => primToJson(p));
      expect(staticJson).toEqual(legacy.slice(0, 3));
      expect(dynamicJson).toEqual(legacy.slice(3));
    });

    it(`${label}: spec is pinned`, () => {
      const spec = buildFilterSpec(resolveGlassParams({ ...combo, blur: 0.5, specularStrength: 1.1, displacementScale: 150 }), REFS);
      expect(spec).toMatchSnapshot();
    });
  }

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
    expect(d[d.length - 4].attrs.in).toBe('chromaticFastOut'); // noise feDisplacementMap
    expect(d[d.length - 1].attrs.in).toBe('refrNoise_high'); // final blend
    expect(d[d.length - 1].attrs.result).toBe('final');
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
