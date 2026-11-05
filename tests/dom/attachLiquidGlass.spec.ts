import { describe, it, expect } from 'vitest';
import { FakeDocument, type FakeElement } from '../helpers/fakeDom';
import { attachLiquidGlass } from '../../src/dom/attachLiquidGlass';
import type { RGBAImage } from '../../src/core/image';

type Doc = Pick<Document, 'createElementNS'>;

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observed: unknown[] = [];
  disconnected = false;
  constructor(public cb: (entries: ResizeObserverEntry[]) => void) {
    FakeResizeObserver.instances.push(this);
  }
  observe(t: unknown) {
    this.observed.push(t);
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
  fire(width: number, height: number) {
    this.cb([{ borderBoxSize: [{ inlineSize: width, blockSize: height }] } as unknown as ResizeObserverEntry]);
  }
}

function env() {
  const doc = new FakeDocument();
  const target = doc.body.appendChild(doc.createElement('div'));
  target.rect = { x: 0, y: 0, top: 0, left: 0, width: 320, height: 100, right: 320, bottom: 100 };
  let n = 0;
  const encodeImage = async (_img: RGBAImage) => `blob:${++n}`;
  FakeResizeObserver.instances = [];
  const attach = (opts: Parameters<typeof attachLiquidGlass>[1] = {}) =>
    attachLiquidGlass(target as unknown as HTMLElement, {
      document: doc as unknown as Doc,
      dpr: 1,
      encodeImage,
      revokeImage: () => {},
      resizeObserver: FakeResizeObserver as unknown as typeof ResizeObserver,
      radius: 24,
      ...opts,
    });
  return { doc, target, attach };
}

describe('attachLiquidGlass', () => {
  it('measures the target, observes it, and applies the styles after the first render', async () => {
    const { target, attach } = env();
    const h = attach({ id: 'lg-t' });
    expect(h.target).toBe(target);
    expect(target.style.backdropFilter).toBeUndefined();
    await h.ready;
    expect(h.params.width).toBe(320);
    expect(h.params.height).toBe(100);
    expect(h.params.radius).toBe(24);
    expect(target.style.backdropFilter).toBe('url(#lg-t) saturate(1)');
    expect(target.style.WebkitBackdropFilter).toBe('url(#lg-t) saturate(1)');
    expect(target.style.backgroundColor).toBe('rgba(0, 0, 0, 0.05)');
    expect(target.style.borderRadius).toBe('24px');
    expect(FakeResizeObserver.instances).toHaveLength(1);
    expect(FakeResizeObserver.instances[0].observed).toEqual([target]);
    expect(target.children.map((c) => c.tagName)).toEqual(['svg']);
  });

  it('follows size changes reported by the observer', async () => {
    const { attach } = env();
    const h = attach();
    await h.ready;
    FakeResizeObserver.instances[0].fire(500, 250);
    await h.update({});
    expect(h.params.width).toBe(500);
    expect(h.params.height).toBe(250);
    expect((h.filterElement as unknown as FakeElement).getAttribute('width')).toBe('500');
  });

  it('a fixed size disables observation', async () => {
    const { attach } = env();
    const h = attach({ size: { width: 640, height: 200 } });
    await h.ready;
    expect(FakeResizeObserver.instances).toHaveLength(0);
    expect(h.params.width).toBe(640);
  });

  it('falls back to given/default size when the target has no layout yet', async () => {
    const { target, attach } = env();
    target.rect = { ...target.rect, width: 0, height: 0 };
    const h = attach({ width: 123, height: 45 });
    await h.ready;
    expect(h.params.width).toBe(123);
    expect(h.params.height).toBe(45);
  });

  it('re-applies styles when tint, saturation or radius change', async () => {
    const { target, attach } = env();
    const h = attach({ id: 'lg-s' });
    await h.ready;
    await h.update({ tint: 0.2, saturation: 1.5, radius: 10 });
    expect(target.style.backdropFilter).toBe('url(#lg-s) saturate(1.5)');
    expect(target.style.backgroundColor).toBe('rgba(0, 0, 0, 0.2)');
    expect(target.style.borderRadius).toBe('10px');
  });

  it('applyStyles:false leaves the element alone and getStyle() hands back the declarations', async () => {
    const { target, attach } = env();
    const h = attach({ id: 'lg-n', applyStyles: false });
    await h.ready;
    expect(target.style.backdropFilter).toBeUndefined();
    expect(h.getStyle()).toEqual({
      backdropFilter: 'url(#lg-n) saturate(1)',
      WebkitBackdropFilter: 'url(#lg-n) saturate(1)',
      backgroundColor: 'rgba(0, 0, 0, 0.05)',
      borderRadius: '24px',
    });
  });

  it("radius 'css' with no computed style falls back to the default radius", async () => {
    const { attach } = env();
    const h = attach({ radius: 'css' });
    await h.ready;
    expect(h.params.radius).toBe(50); // default 60 clamped to half of the 100px height
    expect(h.getStyle().borderRadius).toBeUndefined();
  });

  it('destroy disconnects the observer, restores inline styles, removes the svg', async () => {
    const { target, attach } = env();
    target.style.backgroundColor = 'tomato';
    const h = attach();
    await h.ready;
    expect(target.style.backgroundColor).toBe('rgba(0, 0, 0, 0.05)');
    h.destroy();
    expect(FakeResizeObserver.instances[0].disconnected).toBe(true);
    expect(target.style.backgroundColor).toBe('tomato');
    expect(target.style.backdropFilter).toBe('');
    expect(target.children).toHaveLength(0);
    expect(h.destroyed).toBe(true);
  });
});
