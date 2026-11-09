import { describe, it, expect } from 'vitest';
import { FakeDocument } from '../helpers/fakeDom';
import { createFilterSvg, applyFilterSpec } from '../../src/dom/mountFilter';
import { buildFilterSpec } from '../../src/core/filters/spec';
import { resolveGlassParams } from '../../src/core/params';

const REFS = { id: 'lg-1', mapHref: 'blob:a', lightHref: 'blob:light' };
type Doc = Pick<Document, 'createElementNS'>;
type El = { tagName: string; getAttribute(n: string): string | null; children: El[] };

describe('mountFilter', () => {
  it('creates a hidden 0x0 svg shell with the filter id', () => {
    const doc = new FakeDocument();
    const { svg, filter } = createFilterSvg(doc as unknown as Doc, 'lg-7');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('style')).toContain('width:0;height:0');
    expect(filter.getAttribute('id')).toBe('lg-7');
    expect((svg as unknown as { children: unknown[] }).children.length).toBe(1);
  });

  it('first apply materializes the filter attributes and every primitive', () => {
    const doc = new FakeDocument();
    const { filter } = createFilterSvg(doc as unknown as Doc, 'lg-1');
    const spec = buildFilterSpec(resolveGlassParams({ dispersion: 1 }), REFS);
    applyFilterSpec(doc as unknown as Doc, filter, null, spec);
    expect(filter.getAttribute('filterUnits')).toBe('objectBoundingBox');
    expect(filter.getAttribute('width')).toBe('1');
    expect(filter.getAttribute('color-interpolation-filters')).toBe('sRGB');
    const f = filter as unknown as El;
    expect(f.children.length).toBe(spec.static.length + spec.dynamic.length);
    expect(f.children[0].tagName).toBe('feImage');
    expect(f.children.filter((c) => c.tagName === 'feDisplacementMap')).toHaveLength(3);
  });

  it('same structure: writes only changed attributes and keeps element identity', () => {
    const doc = new FakeDocument();
    const { filter } = createFilterSvg(doc as unknown as Doc, 'lg-1');
    const a = buildFilterSpec(resolveGlassParams({ blur: 0.2, specularStrength: 0.9 }), REFS);
    applyFilterSpec(doc as unknown as Doc, filter, null, a);
    const f = filter as unknown as El;
    const before = [...f.children];

    const b = buildFilterSpec(resolveGlassParams({ blur: 1.25, specularStrength: 0.3, displacementScale: 42 }), { ...REFS, mapHref: 'blob:b', lightHref: 'blob:light' });
    applyFilterSpec(doc as unknown as Doc, filter, a, b);
    expect([...f.children]).toEqual(before);
    expect(f.children[0].getAttribute('href')).toBe('blob:b'); // map
    expect(f.children[1].getAttribute('href')).toBe('blob:light'); // light map
    expect(f.children[2].getAttribute('scale')).toBe('42'); // displacement
    expect(f.children[3].getAttribute('stdDeviation')).toBe('1.25'); // blur
    expect(f.children[4].getAttribute('values')).toContain(' 0.3012 0.5217 -0.3 0 -0.413'); // rim side A at strength 0.3, 60°
  });

  it('different structure: rebuilds the children', () => {
    const doc = new FakeDocument();
    const { filter } = createFilterSvg(doc as unknown as Doc, 'lg-1');
    const a = buildFilterSpec(resolveGlassParams({ dispersion: 1, blurKind: 'noise1' }), REFS);
    applyFilterSpec(doc as unknown as Doc, filter, null, a);
    const b = buildFilterSpec(resolveGlassParams({ dispersion: 0, blurKind: 'gauss', specular: false }), REFS);
    applyFilterSpec(doc as unknown as Doc, filter, a, b);
    const f = filter as unknown as El;
    expect(f.children.map((c) => c.tagName)).toEqual(['feImage', 'feImage', 'feDisplacementMap', 'feGaussianBlur']);
  });

  it('a padded spec switches the region to px and gives the map image an explicit box; and back', () => {
    const doc = new FakeDocument();
    const { filter } = createFilterSvg(doc as unknown as Doc, 'lg-1');
    const a = buildFilterSpec(resolveGlassParams({ width: 300, height: 120 }), REFS);
    applyFilterSpec(doc as unknown as Doc, filter, null, a);
    const b = buildFilterSpec(resolveGlassParams({ width: 400, height: 200 }), REFS, { padding: 10 });
    applyFilterSpec(doc as unknown as Doc, filter, a, b);
    const f = filter as unknown as El;
    expect(f.getAttribute('filterUnits')).toBe('userSpaceOnUse');
    expect(f.getAttribute('x')).toBe('-10');
    expect(f.getAttribute('width')).toBe('420');
    expect(f.getAttribute('height')).toBe('220');
    expect(f.children[0].getAttribute('width')).toBe('400');
    expect(f.children[0].getAttribute('height')).toBe('200');
    const c = buildFilterSpec(resolveGlassParams({ width: 400, height: 200 }), REFS);
    applyFilterSpec(doc as unknown as Doc, filter, b, c);
    expect(f.getAttribute('filterUnits')).toBe('objectBoundingBox');
    expect(f.getAttribute('width')).toBe('1');
    expect(f.children[0].getAttribute('width')).toBeNull();
  });
});
