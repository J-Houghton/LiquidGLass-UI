import { describe, it, expect } from 'vitest';
import { MapRegistry, UrlSlot } from '../../src/dom/mapCache';
import { FakeDocument, type FakeElement } from '../helpers/fakeDom';
import { createGlassFilter } from '../../src/dom/createGlassFilter';
import type { RGBAImage } from '../../src/core/image';

type Doc = Pick<Document, 'createElementNS'>;

describe('MapRegistry', () => {
  it('shares one URL per key and revokes when the last holder releases', async () => {
    const revoked: string[] = [];
    const reg = new MapRegistry((u) => revoked.push(u));
    let produced = 0;
    const produce = async () => `blob:${++produced}`;
    const a = await reg.acquire('k', produce);
    const b = await reg.acquire('k', produce);
    expect(a).toBe('blob:1');
    expect(b).toBe('blob:1');
    expect(produced).toBe(1);
    expect(reg.size).toBe(1);
    reg.release('k');
    expect(revoked).toEqual([]);
    reg.release('k');
    expect(revoked).toEqual(['blob:1']);
    expect(reg.size).toBe(0);
    reg.release('k'); // unknown key: ignored
  });

  it('dedupes concurrent requests for the same key during encoding', async () => {
    const reg = new MapRegistry(() => {});
    let resolveIt!: (u: string) => void;
    let produced = 0;
    const produce = () =>
      new Promise<string>((r) => {
        produced++;
        resolveIt = r;
      });
    const p1 = reg.acquire('k', produce);
    const p2 = reg.acquire('k', produce);
    expect(produced).toBe(1);
    resolveIt('blob:x');
    expect(await Promise.all([p1, p2])).toEqual(['blob:x', 'blob:x']);
  });

  it('revokes on arrival when every holder released during encoding', async () => {
    const revoked: string[] = [];
    const reg = new MapRegistry((u) => revoked.push(u));
    let resolveIt!: (u: string) => void;
    const p = reg.acquire('k', () => new Promise<string>((r) => (resolveIt = r)));
    reg.release('k');
    resolveIt('blob:late');
    await p;
    expect(revoked).toEqual(['blob:late']);
    expect(reg.size).toBe(0);
  });

  it('a failed encode is not cached and the reference is dropped', async () => {
    const reg = new MapRegistry(() => {});
    await expect(reg.acquire('k', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(reg.size).toBe(0);
    const url = await reg.acquire('k', async () => 'blob:ok');
    expect(url).toBe('blob:ok');
  });

  it('keeps released maps warm up to maxIdle and revives them without producing', async () => {
    const revoked: string[] = [];
    const reg = new MapRegistry((u) => revoked.push(u), { maxIdle: 2 });
    let produced = 0;
    const produce = async () => `blob:${++produced}`;
    await reg.acquire('a', produce);
    reg.release('a');
    expect(revoked).toEqual([]);
    expect(reg.size).toBe(0);
    expect(reg.idleSize).toBe(1);
    expect(await reg.acquire('a', produce)).toBe('blob:1'); // revived, not produced again
    expect(produced).toBe(1);
    expect(reg.idleSize).toBe(0);
    reg.release('a');
    await reg.acquire('b', produce);
    reg.release('b');
    await reg.acquire('c', produce);
    reg.release('c'); // third idle map: the oldest (a) is evicted
    expect(revoked).toEqual(['blob:1']);
    expect(reg.idleSize).toBe(2);
    reg.clearIdle();
    expect(revoked).toEqual(['blob:1', 'blob:2', 'blob:3']);
    expect(reg.idleSize).toBe(0);
  });

  it('parks a map that finished encoding after every holder released, when idle is allowed', async () => {
    const revoked: string[] = [];
    const reg = new MapRegistry((u) => revoked.push(u), { maxIdle: 4 });
    let resolveIt!: (u: string) => void;
    const p = reg.acquire('k', () => new Promise<string>((r) => (resolveIt = r)));
    reg.release('k');
    resolveIt('blob:late');
    await p;
    expect(revoked).toEqual([]);
    expect(reg.idleSize).toBe(1);
  });

  it('UrlSlot moves between keys releasing the old one, and releases on dispose', async () => {
    const revoked: string[] = [];
    const reg = new MapRegistry((u) => revoked.push(u));
    const slot = new UrlSlot(reg);
    await slot.acquire('a', async () => 'blob:a');
    await slot.acquire('b', async () => 'blob:b');
    expect(revoked).toEqual(['blob:a']);
    expect(slot.key).toBe('b');
    slot.dispose();
    expect(revoked).toEqual(['blob:a', 'blob:b']);
    expect(slot.url).toBeNull();
    // acquiring after dispose releases immediately
    await slot.acquire('c', async () => 'blob:c');
    expect(revoked).toEqual(['blob:a', 'blob:b', 'blob:c']);
  });
});

describe('createGlassFilter with a shared registry', () => {
  it('two handles with identical maps encode once and revoke once', async () => {
    const doc = new FakeDocument();
    const host = doc.body.appendChild(doc.createElement('div'));
    const revoked: string[] = [];
    let encodes = 0;
    const registry = new MapRegistry((u) => revoked.push(u));
    const make = () =>
      createGlassFilter(host as unknown as Element, {
        document: doc as unknown as Doc,
        dpr: 1,
        registry,
        encodeImage: async (_img: RGBAImage) => `blob:${++encodes}`,
        revokeImage: (u) => revoked.push(u),
        width: 200,
        height: 80,
      });
    const a = make();
    const b = make();
    await Promise.all([a.ready, b.ready]);
    expect(encodes).toBe(1);
    expect((a.filterElement as unknown as FakeElement).children[0].getAttribute('href')).toBe('blob:1');
    expect((b.filterElement as unknown as FakeElement).children[0].getAttribute('href')).toBe('blob:1');

    await b.update({ radius: 10 }); // b diverges: its own map; a keeps the shared one alive
    expect(encodes).toBe(2);
    expect(revoked).toEqual([]);

    a.destroy();
    expect(revoked).toEqual(['blob:1']);
    b.destroy();
    expect(revoked).toEqual(['blob:1', 'blob:2']);
    expect(registry.size).toBe(0);
  });
});
