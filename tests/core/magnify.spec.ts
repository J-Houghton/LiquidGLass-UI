/**
 * `magnify`: a small zoom map (a straight ramp) displaces the backdrop toward the lens's middle before
 * the rest of the graph, so what's behind the lens is drawn larger.
 */
import { describe, it, expect } from 'vitest';
import { resolveGlassParams } from '../../src/core/params';
import { buildFilterSpec } from '../../src/core/filters/spec';
import { zoomMap } from '../../src/core/optics/zoom';
import { createGlassFilter } from '../../src/dom/createGlassFilter';
import type { RGBAImage } from '../../src/core/image';
import { FakeDocument, type FakeElement } from '../helpers/fakeDom';

const REFS = { id: 'lg-zoom', mapHref: 'blob:map', lightHref: 'blob:light', zoomHref: 'blob:zoom' };
const px = (img: RGBAImage, x: number, y: number) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));

describe('magnify (params)', () => {
  it('is off by default, and never below 0', () => {
    expect(resolveGlassParams({}).magnify).toBe(0);
    const r = resolveGlassParams({ magnify: -5 });
    expect(r.magnify).toBe(0);
    expect(r.notes.some((n) => n.startsWith('magnify'))).toBe(true);
    expect(resolveGlassParams({ magnify: 40 }).magnify).toBe(40);
  });
});

describe('zoomMap', () => {
  it('falls in a straight line across the lens, neutral in the middle', () => {
    const img = zoomMap(200, 200, 64);
    expect(img.width).toBe(64);
    // R: high on the left (draw from further right), low on the right
    expect(px(img, 0, 32)[0]).toBeGreaterThan(250);
    expect(px(img, 63, 32)[0]).toBeLessThan(5);
    expect(Math.abs(px(img, 31, 32)[0] - 128) + Math.abs(px(img, 32, 32)[0] - 128)).toBeLessThanOrEqual(5);
    // G the same, top to bottom
    expect(px(img, 32, 0)[1]).toBeGreaterThan(250);
    expect(px(img, 32, 63)[1]).toBeLessThan(5);
    // straight: equal steps
    const row = Array.from({ length: 64 }, (_, i) => px(img, i, 10)[0]);
    const steps = row.slice(1).map((v, i) => row[i] - v);
    expect(Math.max(...steps) - Math.min(...steps)).toBeLessThanOrEqual(1);
    expect(px(img, 5, 5)[3]).toBe(255);
  });

  it('cuts the shorter side in proportion, so the zoom is the same both ways', () => {
    const img = zoomMap(300, 150, 64);
    expect(px(img, 0, 32)[0]).toBeGreaterThan(250);
    // half the reach top to bottom
    expect(px(img, 32, 0)[1]).toBeGreaterThan(185);
    expect(px(img, 32, 0)[1]).toBeLessThan(195);
    expect(px(img, 32, 63)[1]).toBeGreaterThan(62);
    expect(px(img, 32, 63)[1]).toBeLessThan(72);
  });
});

describe('magnify (filter graph)', () => {
  it('without it, or without a zoom map, nothing changes', () => {
    const plain = buildFilterSpec(resolveGlassParams({}), REFS);
    expect(plain.static.map((p) => p.attrs.result)).toEqual(['map', 'light']);
    expect(plain.structureKey).not.toContain('zoom');
    const noMap = buildFilterSpec(resolveGlassParams({ magnify: 30 }), { ...REFS, zoomHref: undefined });
    expect(noMap.static).toHaveLength(2);
    expect(noMap.dynamic.some((p) => p.attrs.in2 === 'zoom')).toBe(false);
  });

  it('zooms first, and the lens bends the zoomed backdrop', () => {
    const spec = buildFilterSpec(resolveGlassParams({ magnify: 36.5 }), REFS);
    expect(spec.static.map((p) => p.attrs.result)).toEqual(['map', 'light', 'zoom']);
    expect(spec.static[2].attrs.href).toBe('blob:zoom');
    expect(spec.dynamic[0]).toEqual({
      tag: 'feDisplacementMap',
      attrs: { in: 'SourceGraphic', in2: 'zoom', xChannelSelector: 'R', yChannelSelector: 'G', scale: '36.5', result: 'zoomed' },
    });
    expect(spec.dynamic[1].attrs).toMatchObject({ in: 'zoomed', in2: 'map', result: 'refr' });
    expect(spec.structureKey).toMatch(/\|zoom$/);
    // a different strength is the same graph with a new attribute
    expect(buildFilterSpec(resolveGlassParams({ magnify: 10 }), REFS).structureKey).toBe(spec.structureKey);
  });

  it('blurring first blurs the zoomed backdrop; dispersion and the light layer read it too', () => {
    const before = buildFilterSpec(resolveGlassParams({ magnify: 20, blurStage: 'before', blur: 2 }), REFS);
    expect(before.dynamic[1].attrs).toMatchObject({ in: 'zoomed', result: 'blurred' });
    const fringe = buildFilterSpec(resolveGlassParams({ magnify: 20, dispersion: 1 }), REFS);
    expect(fringe.dynamic.filter((p) => p.attrs.in2 === 'map').every((p) => p.attrs.in === 'zoomed')).toBe(true);
    const layered = buildFilterSpec(resolveGlassParams({ magnify: 20 }), REFS, { lightLayer: true });
    expect(layered.static.map((p) => p.attrs.result)).toEqual(['map', 'zoom']);
  });

  it('in content mode, it is confined to the lens like every other stage', () => {
    const spec = buildFilterSpec(resolveGlassParams({ magnify: 20, width: 100, height: 60 }), REFS, { region: { x: 10, y: 20, width: 100, height: 60 } });
    expect(spec.static[2].attrs).toMatchObject({ x: '10', y: '20', width: '100', height: '60', result: 'zoom' });
    expect(spec.dynamic[0].attrs).toMatchObject({ x: '10', y: '20', width: '100', height: '60', in2: 'zoom' });
  });
});

describe('magnify (createGlassFilter)', () => {
  function env() {
    const doc = new FakeDocument();
    const host = doc.body.appendChild(doc.createElement('div'));
    const encoded: RGBAImage[] = [];
    const revoked: string[] = [];
    let n = 0;
    const h = (opts: Parameters<typeof createGlassFilter>[1]) =>
      createGlassFilter(host as unknown as Element, {
        document: doc as unknown as Pick<Document, 'createElementNS'>,
        dpr: 1,
        encodeImage: async (img) => {
          encoded.push(img);
          return `blob:${++n}`;
        },
        revokeImage: (u) => revoked.push(u),
        ...opts,
      });
    return { h, encoded, revoked };
  }
  const zoomOf = (h: { filterElement: unknown }) =>
    (h.filterElement as unknown as FakeElement).children.find((c) => c.getAttribute('result') === 'zoomed');

  it('makes the zoom map once for the lens\'s proportions, eases it in with the lens, and gives it back', async () => {
    const { h, encoded, revoked } = env();
    const g = h({ width: 200, height: 100, radius: 50, bezelWidth: 20, magnify: 40, intensity: 0.5 });
    await g.ready;
    expect(encoded).toHaveLength(3); // the two lens maps and the zoom map
    expect(encoded[2].width).toBe(64);
    expect(zoomOf(g)!.getAttribute('scale')).toBe('20'); // half in, half the zoom
    await g.setIntensity(1);
    expect(zoomOf(g)!.getAttribute('scale')).toBe('40');
    await g.update({ magnify: 24 });
    expect(zoomOf(g)!.getAttribute('scale')).toBe('24');
    await g.update({ width: 210, height: 105 }); // the same proportions
    expect(encoded.filter((i) => i.width === 64)).toHaveLength(1);
    await g.update({ width: 210, height: 210 });
    expect(encoded.filter((i) => i.width === 64)).toHaveLength(2);
    expect(revoked).toContain('blob:3');
    await g.update({ magnify: 0 });
    expect(zoomOf(g)).toBeUndefined();
    g.destroy();
    expect(revoked).toContain(`blob:${encoded.length}`);
  });

  it('is never made for a lens that doesn\'t magnify', async () => {
    const { h, encoded } = env();
    const g = h({ width: 200, height: 100 });
    await g.ready;
    expect(encoded).toHaveLength(2);
    expect(zoomOf(g)).toBeUndefined();
  });
});
