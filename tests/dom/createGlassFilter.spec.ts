import { describe, it, expect } from 'vitest';
import { FakeDocument, type FakeElement } from '../helpers/fakeDom';
import { createGlassFilter } from '../../src/dom/createGlassFilter';
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
    expect(encoded).toHaveLength(1); // one map: displacement + rim
    expect(encoded[0].width).toBe(200);
    const kids = filterOf(h).children;
    expect(kids[0].getAttribute('href')).toBe('blob:1');
    expect(h.debug.mapUrl).toBe('blob:1');
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

  it('regenerates the map only when its inputs change, revoking the replaced URL', async () => {
    const { create, encoded, revoked } = env();
    const h = create();
    await h.ready;
    expect(encoded).toHaveLength(1);

    await h.update({ blur: 3, dispersion: 1, specularStrength: 0.5, specular: false }); // graph-only changes
    expect(encoded).toHaveLength(1);
    expect(revoked).toEqual([]);

    await h.update({ specularAngleDeg: 120 }); // rim is baked into the map
    expect(encoded).toHaveLength(2);
    expect(revoked).toEqual(['blob:1']);

    await h.update({ radius: 30 });
    expect(encoded).toHaveLength(3);
    expect(revoked).toEqual(['blob:1', 'blob:2']);
    const kids = (h.filterElement as unknown as FakeElement).children;
    expect(kids[0].getAttribute('href')).toBe('blob:3');
  });

  it('physicalScale uses the optics maximum as the displacement scale', async () => {
    const { create } = env();
    const h = create({ displacementScale: 180 });
    await h.ready;
    const physical = h.debug.physicalMaxDisplacementPx;
    expect(physical).not.toBe(180);
    await h.update({ physicalScale: true });
    const kids = (h.filterElement as unknown as FakeElement).children;
    expect(kids[1].getAttribute('scale')).toBe(String(Math.round(physical * 1000) / 1000));
    expect(h.debug.displacementPx).toBe(physical);
    await h.update({ physicalScale: false });
    expect(kids[1].getAttribute('scale')).toBe('180');
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
    const flush = async () => {
      while (pending.length) pending.shift()!(`blob:${++n}`);
      await Promise.resolve();
    };
    await Promise.resolve();
    expect(pending).toHaveLength(1);
    const p1 = h.update({ radius: 20 });
    const p2 = h.update({ radius: 40 });
    await flush(); // completes the initial render (radius 60 map)
    await flush(); // completes the coalesced radius-40 render
    await Promise.all([h.ready, p1, p2]);
    expect(h.params.radius).toBe(40);
    const kids = (h.filterElement as unknown as FakeElement).children;
    expect(kids[0].getAttribute('href')).toBe('blob:2');
    expect(revoked).toEqual(['blob:1']);
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
    expect(revoked).toEqual(['blob:1']);
    expect(h.destroyed).toBe(true);
    await h.update({ blur: 9 });
    expect(h.debug.renders).toBe(1);
  });

  it('destroy during an in-flight encode revokes the late URL and writes nothing', async () => {
    const { doc, host, revoked } = env();
    let resolveEncode!: (u: string) => void;
    const h = createGlassFilter(host as unknown as Element, {
      document: doc as unknown as Doc,
      dpr: 1,
      encodeImage: () => new Promise<string>((r) => (resolveEncode = r)),
      revokeImage: (u) => revoked.push(u),
    });
    await Promise.resolve();
    h.destroy();
    resolveEncode('blob:late');
    await h.ready;
    expect(revoked).toEqual(['blob:late']);
    expect((h.filterElement as unknown as FakeElement).children).toHaveLength(0);
    expect(h.debug.renders).toBe(0);
  });

  it('setDpr regenerates the map at the new resolution', async () => {
    const { create, encoded } = env();
    const h = create({ width: 100, height: 50 });
    await h.ready;
    await h.setDpr(2);
    expect(h.dpr).toBe(2);
    expect(encoded[1].width).toBe(200);
    expect(encoded[1].height).toBe(100);
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
