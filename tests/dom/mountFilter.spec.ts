import { describe, it, expect } from 'vitest';
import { FakeDocument } from '../helpers/fakeDom';
import { createFilterSvg, applyFilterSpec } from '../../src/dom/mountFilter';
import { buildFilterSpec, TRANSPARENT_PIXEL } from '../../src/core/filters/spec';
import { resolveGlassParams } from '../../src/core/params';

const REFS = { id: 'lg-1', mapHref: 'blob:a', specularHref: TRANSPARENT_PIXEL };
type Doc = Pick<Document, 'createElementNS'>;

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
    expect(filter.getAttribute('width')).toBe('300');
    expect(filter.getAttribute('color-interpolation-filters')).toBe('sRGB');
    const f = filter as unknown as { children: { tagName: string; children: unknown[] }[] };
    expect(f.children.length).toBe(spec.static.length + spec.dynamic.length);
    expect(f.children[0].tagName).toBe('feImage');
    const transfer = f.children.find((c) => c.tagName === 'feComponentTransfer')!;
    expect(transfer.children.length).toBe(1);
  });

  it('same structure: writes only changed attributes and keeps element identity', () => {
    const doc = new FakeDocument();
    const { filter } = createFilterSvg(doc as unknown as Doc, 'lg-1');
    const a = buildFilterSpec(resolveGlassParams({ blur: 0.2, specularStrength: 0.9 }), REFS);
    applyFilterSpec(doc as unknown as Doc, filter, null, a);
    const f = filter as unknown as { children: { tagName: string; getAttribute(n: string): string | null; children: { getAttribute(n: string): string | null }[] }[] };
    const before = [...f.children];

    const b = buildFilterSpec(resolveGlassParams({ blur: 1.25, specularStrength: 0.3, displacementScale: 42 }), { ...REFS, mapHref: 'blob:b' });
    applyFilterSpec(doc as unknown as Doc, filter, a, b);
    expect([...f.children]).toEqual(before);
    expect(f.children[0].getAttribute('href')).toBe('blob:b');
    expect(f.children[1].getAttribute('scale')).toBe('42');
    expect(f.children[3].getAttribute('stdDeviation')).toBe('1.25');
    expect(f.children[4].children[0].getAttribute('slope')).toBe('0.3');
  });

  it('different structure: rebuilds the children', () => {
    const doc = new FakeDocument();
    const { filter } = createFilterSvg(doc as unknown as Doc, 'lg-1');
    const a = buildFilterSpec(resolveGlassParams({ dispersion: 1, blurKind: 'noise1' }), REFS);
    applyFilterSpec(doc as unknown as Doc, filter, null, a);
    const b = buildFilterSpec(resolveGlassParams({ dispersion: 0, blurKind: 'gauss', specular: false }), REFS);
    applyFilterSpec(doc as unknown as Doc, filter, a, b);
    const f = filter as unknown as { children: { tagName: string }[] };
    expect(f.children.map((c) => c.tagName)).toEqual(['feImage', 'feDisplacementMap', 'feImage', 'feGaussianBlur']);
  });

  it('a size change updates the filter region and the map image box', () => {
    const doc = new FakeDocument();
    const { filter } = createFilterSvg(doc as unknown as Doc, 'lg-1');
    const a = buildFilterSpec(resolveGlassParams({ width: 300, height: 120 }), REFS);
    applyFilterSpec(doc as unknown as Doc, filter, null, a);
    const b = buildFilterSpec(resolveGlassParams({ width: 400, height: 200 }), REFS);
    applyFilterSpec(doc as unknown as Doc, filter, a, b);
    const f = filter as unknown as { getAttribute(n: string): string | null; children: { getAttribute(n: string): string | null }[] };
    expect(f.getAttribute('width')).toBe('400');
    expect(f.getAttribute('height')).toBe('200');
    expect(f.children[0].getAttribute('width')).toBe('400');
    expect(f.children[0].getAttribute('height')).toBe('200');
  });
});
