import { describe, it, expect } from 'vitest';
import { FakeDocument, type FakeElement, type FakeJson } from '../helpers/fakeDom';
import { createGlassFilter, bucketSize } from '../../src/dom/createGlassFilter';
import type { RGBAImage } from '../../src/core/image';

type Doc = Pick<Document, 'createElementNS'>;

function env() {
  const doc = new FakeDocument();
  const host = doc.body.appendChild(doc.createElement('div'));
  const encoded: RGBAImage[] = [];
  const revoked: string[] = [];
  let n = 0;
  const encodeImage = async (img: RGBAImage) => {
    encoded.push(img);
    return `blob:${++n}`;
  };
  const revokeImage = (u: string) => {
    revoked.push(u);
  };
  const create = (opts: Parameters<typeof createGlassFilter>[1] = {}) =>
    createGlassFilter(host as unknown as Element, { document: doc as unknown as Doc, dpr: 1, encodeImage, revokeImage, ...opts });
  const filterOf = (h: { filterElement: unknown }) => h.filterElement as unknown as FakeElement;
  return { doc, host, encoded, revoked, create, filterOf };
}

describe('createGlassFilter', () => {
  it('mounts a hidden svg inside the host and renders on the next microtask', async () => {
    const { host, encoded, create, filterOf } = env();
    const h = create({ id: 'glass-a', width: 200, height: 100, radius: 20, bezelWidth: 20 });
    expect(h.url).toBe('url(#glass-a)');
    expect(host.children.map((c) => c.tagName)).toEqual(['svg']);
    expect(filterOf(h).children.length).toBe(0); // nothing rendered synchronously
    await h.ready;
    expect(encoded).toHaveLength(2); // two images from one walk: displacement map, light map
    expect(encoded[0].width).toBe(Math.round(bucketSize(200))); // 202: sizes above 64 px are bucketed
    expect(encoded[1].width).toBe(encoded[0].width);
    const kids = filterOf(h).children;
    expect(kids[0].getAttribute('href')).toBe('blob:1');
    expect(kids[1].getAttribute('href')).toBe('blob:2');
    expect(h.debug.mapUrl).toBe('blob:1');
    expect(h.debug.lightUrl).toBe('blob:2');
    expect(h.debug.renders).toBe(1);
    expect(h.debug.physicalMaxDisplacementPx).toBeGreaterThan(1);
    expect(h.debug.displacementPx).toBe(180);
  });

  it('coalesces updates made in the same tick into one render', async () => {
    const { create, filterOf } = env();
    const h = create();
    await h.ready;
    const a = h.update({ blur: 1 });
    const b = h.update({ blur: 2 });
    await Promise.all([a, b]);
    expect(h.debug.renders).toBe(2);
    expect(filterOf(h).querySelector('feGaussianBlur')!.getAttribute('stdDeviation')).toBe('2.00');
    expect(h.params.blur).toBe(2);
  });

  it('regenerates the maps only when geometry or optics change, revoking the replaced URLs', async () => {
    const { create, encoded, revoked, filterOf } = env();
    const h = create();
    await h.ready;
    expect(encoded).toHaveLength(2);

    await h.update({ blur: 3, dispersion: 1, specularStrength: 0.5 }); // graph-only changes
    expect(encoded).toHaveLength(2);
    expect(revoked).toEqual([]);

    // the light direction is a graph attribute: the rim matrices change, the maps do not
    const before = filterOf(h).querySelector('[result="rimA"]')!.getAttribute('values');
    await h.update({ specularAngleDeg: 120 });
    expect(encoded).toHaveLength(2);
    expect(revoked).toEqual([]);
    expect(filterOf(h).querySelector('[result="rimA"]')!.getAttribute('values')).not.toBe(before);

    await h.update({ radius: 30 });
    expect(encoded).toHaveLength(4);
    expect(revoked).toEqual(['blob:1', 'blob:2']);
    const kids = filterOf(h).children;
    expect(kids[0].getAttribute('href')).toBe('blob:3');
    expect(kids[1].getAttribute('href')).toBe('blob:4');
  });

  it('physicalScale uses the optics maximum as the displacement scale', async () => {
    const { create } = env();
    const h = create({ displacementScale: 180 });
    await h.ready;
    const physical = h.debug.physicalMaxDisplacementPx;
    expect(physical).not.toBe(180);
    await h.update({ physicalScale: true });
    const kids = (h.filterElement as unknown as FakeElement).children;
    expect(kids[2].getAttribute('scale')).toBe(String(Math.round(physical * 1000) / 1000));
    expect(h.debug.displacementPx).toBe(physical);
    await h.update({ physicalScale: false });
    expect(kids[2].getAttribute('scale')).toBe('180');
  });

  it('intensity scales displacement and rim through attributes only, never the map', async () => {
    const { create, encoded } = env();
    const h = create({ intensity: 0.5 });
    await h.ready;
    const kids = (h.filterElement as unknown as FakeElement).children;
    expect(h.intensity).toBe(0.5);
    expect(kids[2].getAttribute('scale')).toBe('90');
    const rimA = kids.find((k) => k.getAttribute('result') === 'rimA')!;
    expect(rimA.getAttribute('values')).toContain(' 0.4066 0.7042 -0.405 0 -0.5576'); // strength 0.405 at 60°
    expect(h.debug.displacementPx).toBe(90);
    await h.setIntensity(1);
    expect(kids[2].getAttribute('scale')).toBe('180');
    expect(rimA.getAttribute('values')).toContain(' 0.8132 1.4085 -0.81 0 -1.1152');
    await h.setIntensity(2); // clamped
    expect(h.intensity).toBe(1);
    await h.setIntensity(0);
    expect(kids[2].getAttribute('scale')).toBe('0');
    expect(encoded).toHaveLength(2);
  });

  it('buckets map sizes on a 1.02 grid so nearby sizes share one map', async () => {
    expect(bucketSize(64)).toBe(64);
    expect(bucketSize(10)).toBe(10);
    expect(bucketSize(301)).toBeCloseTo(305.7, 0);
    expect(bucketSize(305)).toBe(bucketSize(301));
    expect(bucketSize(320)).toBeGreaterThan(bucketSize(305));
    expect(bucketSize(301, 1)).toBe(301);
    expect(bucketSize(Math.pow(1.02, 290))).toBeCloseTo(Math.pow(1.02, 290), 9); // exact powers stay put

    const { create, encoded } = env();
    const h = create({ width: 301, height: 151 });
    await h.ready;
    expect(encoded).toHaveLength(2);
    expect(h.debug.mapWidth).toBe(Math.round(bucketSize(301)));
    expect(h.debug.mapHeight).toBe(Math.round(bucketSize(151)));
    expect(encoded[0].width).toBe(h.debug.mapWidth);
    await h.update({ width: 304, height: 152 }); // same buckets: no regeneration
    expect(encoded).toHaveLength(2);
    expect(h.params.width).toBe(304);
    await h.update({ width: 320 });
    expect(encoded).toHaveLength(4);

    const exact = create({ width: 301, height: 151, sizeBucket: 1 });
    await exact.ready;
    expect(exact.debug.mapWidth).toBe(301);
    await exact.update({ width: 302 });
    expect(encoded).toHaveLength(8);
  });

  it('caps the map at maxMapPixels by lowering the generation ratio, never raising it', async () => {
    const { create, encoded } = env();
    const h = create({ width: 400, height: 300, dpr: 2, maxMapPixels: 100_000, sizeBucket: 1 });
    await h.ready;
    const expected = Math.sqrt(100_000 / (400 * 300)); // 0.9129
    expect(h.debug.mapDpr).toBeCloseTo(expected, 6);
    expect(encoded[0].width).toBe(Math.round(400 * expected));
    expect(encoded[0].height).toBe(Math.round(300 * expected));
    const small = create({ width: 100, height: 50, dpr: 2, maxMapPixels: 100_000, sizeBucket: 1 });
    await small.ready;
    expect(small.debug.mapDpr).toBe(2);
    expect(encoded[2].width).toBe(200); // each generation encodes two images
    const uncapped = create({ width: 400, height: 300, dpr: 2, maxMapPixels: Infinity, sizeBucket: 1 });
    await uncapped.ready;
    expect(encoded[4].width).toBe(800);
  });

  it('shade adds a multiply stage scaled by the parameter and by intensity', async () => {
    const { create } = env();
    const h = create({ shade: 0.5 });
    await h.ready;
    const kids = (h.filterElement as unknown as FakeElement).children;
    const full = kids.find((k) => k.getAttribute('result') === 'shadeFull')!;
    const shade = kids.find((k) => k.getAttribute('result') === 'shade')!;
    expect(full.getAttribute('values')).toContain('  0 0 0.5 0 0'); // k = 0.5 on the light map's B
    expect(shade.getAttribute('k3')).toBe('-0.5');
    await h.setIntensity(0.5);
    expect(full.getAttribute('values')).toContain('  0 0 0.25 0 0'); // k = 0.25
    expect(shade.getAttribute('k3')).toBe('-0.25');
    await h.setIntensity(1);
    await h.update({ shade: 0 });
    expect(kids.some((k) => k.getAttribute('result') === 'shade')).toBe(false);
  });

  it('regionPadding enlarges the filter region', async () => {
    const { create } = env();
    const h = create({ width: 100, height: 50, regionPadding: 8 });
    await h.ready;
    const f = h.filterElement as unknown as FakeElement;
    expect(f.getAttribute('x')).toBe('-8');
    expect(f.getAttribute('width')).toBe('116');
  });

  it('a no-op patch after rendering resolves without a render', async () => {
    const { create } = env();
    const h = create({ blur: 0.5 });
    await h.ready;
    await h.update({ blur: 0.5 });
    await h.update({});
    expect(h.debug.renders).toBe(1);
  });

  it('newest parameters win when an update arrives mid-encode', async () => {
    const { doc, host, revoked } = env();
    const pending: Array<(url: string) => void> = [];
    let n = 0;
    const encodeImage = () => new Promise<string>((resolve) => pending.push(resolve));
    const h = createGlassFilter(host as unknown as Element, {
      document: doc as unknown as Doc,
      dpr: 1,
      encodeImage,
      revokeImage: (u) => revoked.push(u),
    });
    // Resolve whatever encode is pending, then give the scheduler room to start the next render.
    const flush = async () => {
      for (let i = 0; i < 50 && pending.length === 0; i++) await Promise.resolve();
      while (pending.length) pending.shift()!(`blob:${++n}`);
      for (let i = 0; i < 50 && pending.length === 0 && h.debug.renders < 2; i++) await Promise.resolve();
    };
    await Promise.resolve();
    expect(pending).toHaveLength(2); // map and light map encode in parallel
    const p1 = h.update({ radius: 20 });
    const p2 = h.update({ radius: 40 });
    await flush(); // completes the initial render (radius 60 maps)
    await flush(); // completes the coalesced radius-40 render
    await Promise.all([h.ready, p1, p2]);
    expect(h.params.radius).toBe(40);
    const kids = (h.filterElement as unknown as FakeElement).children;
    expect(kids[0].getAttribute('href')).toBe('blob:3');
    expect(kids[1].getAttribute('href')).toBe('blob:4');
    expect(revoked).toEqual(['blob:1', 'blob:2']);
    expect(h.debug.renders).toBe(2);
  });

  it('exposes validated params and notes', async () => {
    const { create } = env();
    const h = create({ width: 100, height: 100, radius: 500 });
    expect(h.params.radius).toBe(50);
    expect(h.params.notes[0]).toMatch(/^radius: 500 → 50/);
    await h.ready;
  });

  it('mounts the svg into `mount` when given', async () => {
    const { doc, host, create } = env();
    const elsewhere = doc.body.appendChild(doc.createElement('section'));
    const h = create({ mount: elsewhere as unknown as Element });
    expect(host.children).toHaveLength(0);
    expect(elsewhere.children.map((c) => c.tagName)).toEqual(['svg']);
    await h.ready;
  });

  it('destroy removes the svg, revokes the URL, and makes later updates no-ops', async () => {
    const { host, revoked, create } = env();
    const h = create();
    await h.ready;
    h.destroy();
    h.destroy();
    expect(host.children).toHaveLength(0);
    expect(revoked).toEqual(['blob:1', 'blob:2']);
    expect(h.destroyed).toBe(true);
    await h.update({ blur: 9 });
    expect(h.debug.renders).toBe(1);
  });

  it('destroy during an in-flight encode revokes the late URL and writes nothing', async () => {
    const { doc, host, revoked } = env();
    const resolvers: Array<(u: string) => void> = [];
    const h = createGlassFilter(host as unknown as Element, {
      document: doc as unknown as Doc,
      dpr: 1,
      encodeImage: () => new Promise<string>((r) => resolvers.push(r)),
      revokeImage: (u) => revoked.push(u),
    });
    await Promise.resolve();
    h.destroy();
    expect(resolvers).toHaveLength(2);
    resolvers[0]('blob:late-map');
    resolvers[1]('blob:late-light');
    await h.ready;
    expect(revoked).toEqual(['blob:late-map', 'blob:late-light']);
    expect((h.filterElement as unknown as FakeElement).children).toHaveLength(0);
    expect(h.debug.renders).toBe(0);
  });

  it('setDpr regenerates the map at the new resolution', async () => {
    const { create, encoded } = env();
    const h = create({ width: 100, height: 50 }); // 100 px is bucketed (> 64): compare against the bucket
    await h.ready;
    await h.setDpr(2);
    expect(h.dpr).toBe(2);
    expect(encoded[2].width).toBe(Math.round(bucketSize(100) * 2));
    expect(encoded[2].height).toBe(100);
  });

  it('calls onRender after each completed render', async () => {
    const { create } = env();
    let calls = 0;
    const h = create({
      onRender: (x) => {
        calls += 1;
        expect(x.debug.renders).toBe(calls);
      },
    });
    await h.ready;
    await h.update({ tint: 0.3 });
    expect(calls).toBe(2);
  });
});

/** Attribute names that differ between two serialized trees of the same shape. */
function changedAttrs(a: FakeJson, b: FakeJson): string[] {
  const out = Object.keys({ ...a.attrs, ...b.attrs }).filter((k) => a.attrs[k] !== b.attrs[k]);
  (a.children ?? []).forEach((c, i) => out.push(...changedAttrs(c, b.children![i])));
  return out;
}

describe('createGlassFilter (content-side lens)', () => {
  it('lens builds the content graph at the offset; setLens moves it by rewriting x/y only', async () => {
    const { create, encoded, filterOf } = env();
    const h = create({ id: 'lg-c', width: 200, height: 100, lens: { x: 40, y: 30 } });
    await h.ready;
    expect(h.lens).toEqual({ x: 40, y: 30 });
    const f = filterOf(h);
    expect(f.getAttribute('filterUnits')).toBe('objectBoundingBox');
    const img = f.children[0];
    expect([img.getAttribute('x'), img.getAttribute('y'), img.getAttribute('width'), img.getAttribute('height')]).toEqual(['40', '30', '200', '100']);
    expect(f.children.slice(-2).map((c) => c.getAttribute('operator'))).toEqual(['out', 'over']);
    const before = f.toJSON();
    const kids = [...f.children];
    await h.setLens({ x: 55.25, y: 30 });
    expect(encoded).toHaveLength(2); // no map work for a move
    expect([...f.children]).toEqual(kids); // diffed in place, same elements
    expect(img.getAttribute('x')).toBe('55.25');
    const changed = changedAttrs(before, f.toJSON());
    expect(new Set(changed)).toEqual(new Set(['x']));
    expect(changed).toHaveLength(f.children.length - 2); // every confined primitive, not the two composites
  });

  it('setLens on a backdrop handle switches to the content graph; same placement or NaN is a no-op', async () => {
    const { create, filterOf } = env();
    const h = create();
    await h.ready;
    expect(h.lens).toBeNull();
    const n = h.debug.renders;
    await h.setLens({ x: 0, y: 0 });
    expect(h.lens).toEqual({ x: 0, y: 0 });
    expect(h.debug.renders).toBe(n + 1);
    expect(filterOf(h).children.at(-1)!.getAttribute('operator')).toBe('over');
    await h.setLens({ x: 0, y: 0 });
    await h.setLens({ x: NaN, y: 0 });
    expect(h.debug.renders).toBe(n + 1);
  });

  it('bumpFilterId gives the filter a fresh id on every re-render; id and url follow', async () => {
    const { create, filterOf } = env();
    const h = create({ id: 'lg-b', bumpFilterId: true });
    await h.ready;
    expect(h.id).toBe('lg-b');
    expect(filterOf(h).getAttribute('id')).toBe('lg-b');
    await h.update({ displacementScale: 100 });
    expect(h.id).toBe('lg-b-r1');
    expect(h.url).toBe('url(#lg-b-r1)');
    expect(filterOf(h).getAttribute('id')).toBe('lg-b-r1');
    await h.setIntensity(0.5);
    expect(h.id).toBe('lg-b-r2');
  });
});
