import { describe, it, expect } from 'vitest';
import { FakeDocument, type FakeElement } from '../helpers/fakeDom';
import { attachLiquidGlass } from '../../src/dom/attachLiquidGlass';
import { bucketSize } from '../../src/dom/createGlassFilter';
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

class FakeMediaQueryList {
  listeners: Array<(e: MediaQueryListEvent) => void> = [];
  constructor(public matches: boolean) {}
  addEventListener(_t: string, cb: (e: MediaQueryListEvent) => void) {
    this.listeners.push(cb);
  }
  removeEventListener(_t: string, cb: (e: MediaQueryListEvent) => void) {
    this.listeners = this.listeners.filter((l) => l !== cb);
  }
  set(matches: boolean) {
    this.matches = matches;
    for (const l of this.listeners) l({ matches } as MediaQueryListEvent);
  }
}

function env() {
  const doc = new FakeDocument();
  const target = doc.body.appendChild(doc.createElement('div'));
  target.rect = { x: 0, y: 0, top: 0, left: 0, width: 320, height: 100, right: 320, bottom: 100 };
  let n = 0;
  const encoded: RGBAImage[] = [];
  const encodeImage = async (img: RGBAImage) => {
    encoded.push(img);
    return `blob:${++n}`;
  };
  FakeResizeObserver.instances = [];
  const attach = (opts: Parameters<typeof attachLiquidGlass>[1] = {}) =>
    attachLiquidGlass(target as unknown as HTMLElement, {
      document: doc as unknown as Doc,
      dpr: 1,
      encodeImage,
      revokeImage: () => {},
      resizeObserver: FakeResizeObserver as unknown as typeof ResizeObserver,
      radius: 24,
      support: 'full',
      ...opts,
    });
  return { doc, target, attach, encoded };
}

describe('attachLiquidGlass (glass mode)', () => {
  it('measures the target, observes it, and applies the styles after the first render', async () => {
    const { target, attach } = env();
    const h = attach({ id: 'lg-t' });
    expect(h.target).toBe(target);
    expect(h.mode).toBe('glass');
    expect(h.support).toBe('full');
    expect(target.style.backdropFilter).toBeUndefined();
    expect(target.getAttribute('data-liquid-glass')).toBeNull();
    await h.ready;
    expect(h.params.width).toBe(320);
    expect(h.params.height).toBe(100);
    expect(h.params.radius).toBe(24);
    expect(target.style.backdropFilter).toBe('url(#lg-t) saturate(1)');
    expect(target.style.WebkitBackdropFilter).toBe('url(#lg-t) saturate(1)');
    expect(target.style.backgroundColor).toBe('rgba(0, 0, 0, 0.05)');
    expect(target.style.borderRadius).toBe('24px');
    expect(target.getAttribute('data-liquid-glass')).toBe('glass');
    expect(FakeResizeObserver.instances).toHaveLength(1);
    expect(FakeResizeObserver.instances[0].observed).toEqual([target]);
    expect(target.children.map((c) => c.tagName)).toEqual(['svg']);
  });

  it('follows size changes reported by the observer: new map, region stays the element box', async () => {
    const { attach, encoded } = env();
    const h = attach();
    await h.ready;
    expect(encoded).toHaveLength(1);
    FakeResizeObserver.instances[0].fire(500, 250);
    await h.update({});
    expect(h.params.width).toBe(500);
    expect(h.params.height).toBe(250);
    expect(encoded).toHaveLength(2);
    expect(encoded[1].width).toBe(Math.round(bucketSize(500))); // bucketed CSS size at dpr 1
    const f = h.filterElement as unknown as FakeElement;
    expect(f.getAttribute('filterUnits')).toBe('objectBoundingBox');
    expect(f.getAttribute('width')).toBe('1');
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
    expect(target.getAttribute('data-liquid-glass')).toBeNull();
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

  it("fallback:'none' attaches the real filter even when detection says frost", async () => {
    const { attach, encoded } = env();
    const h = attach({ support: 'frost', fallback: 'none' });
    await h.ready;
    expect(h.mode).toBe('glass');
    expect(h.support).toBe('frost');
    expect(encoded).toHaveLength(1);
  });

  it('destroy disconnects the observer, restores inline styles, removes the svg and the data attribute', async () => {
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
    expect(target.getAttribute('data-liquid-glass')).toBeNull();
    expect(h.destroyed).toBe(true);
  });
});

describe('attachLiquidGlass (frost fallback)', () => {
  it('generates no maps and applies a CSS blur, tint and rim hint', async () => {
    const { target, attach, encoded } = env();
    const h = attach({ support: 'frost', tint: 0.1, specularStrength: 1 });
    expect(h.mode).toBe('frost');
    await h.ready;
    expect(encoded).toHaveLength(0);
    expect(FakeResizeObserver.instances).toHaveLength(0);
    expect(target.style.backdropFilter).toBe('blur(12px) saturate(1)');
    expect(target.style.WebkitBackdropFilter).toBe('blur(12px) saturate(1)');
    expect(target.style.backgroundColor).toBe('rgba(0, 0, 0, 0.1)');
    expect(target.style.boxShadow).toBe('inset 0 0 0 1px rgba(255, 255, 255, 0.35)');
    expect(target.style.borderRadius).toBe('24px');
    expect(target.getAttribute('data-liquid-glass')).toBe('frost');
    expect(h.url).toMatch(/^url\(#lg-frost-/);
    expect(target.children.map((c) => c.tagName)).toEqual(['svg']); // empty shell, no primitives
    expect((h.filterElement as unknown as FakeElement).children).toHaveLength(0);
    expect(h.debug.renders).toBe(1);
  });

  it("'none' support also takes the frost path, and frostBlurPx tunes it", async () => {
    const { target, attach } = env();
    const h = attach({ support: 'none', frostBlurPx: 20, specular: false });
    await h.ready;
    expect(h.mode).toBe('frost');
    expect(target.style.backdropFilter).toBe('blur(20px) saturate(1)');
    expect(target.style.boxShadow).toBe('');
  });

  it('update re-resolves params and restyles; destroy restores', async () => {
    const { target, attach } = env();
    target.style.boxShadow = 'none';
    const h = attach({ support: 'frost' });
    await h.ready;
    await h.update({ tint: 0.5, saturation: 2, blur: 2.2, specular: false });
    expect(target.style.backgroundColor).toBe('rgba(0, 0, 0, 0.5)');
    expect(target.style.backdropFilter).toBe('blur(20px) saturate(2)');
    expect(target.style.boxShadow).toBe('none');
    expect(h.params.tint).toBe(0.5);
    expect(h.debug.renders).toBe(2);
    await h.update({ tint: 0.5 }); // no-op
    expect(h.debug.renders).toBe(2);
    h.destroy();
    expect(target.style.backdropFilter).toBe('');
    expect(target.style.boxShadow).toBe('none');
    expect(target.children).toHaveLength(0);
    expect(h.destroyed).toBe(true);
    await h.update({ tint: 0.9 });
    expect(h.debug.renders).toBe(2);
  });
});

describe('attachLiquidGlass (appear)', () => {
  /** Manual clock + frame queue standing in for performance.now / requestAnimationFrame. */
  function clock() {
    let t = 0;
    const frames: Array<(time: number) => void> = [];
    return {
      now: () => t,
      animationFrame: (cb: (time: number) => void) => {
        frames.push(cb);
        return frames.length;
      },
      advance(ms: number) {
        t += ms;
        for (const f of frames.splice(0)) f(t);
      },
      get pending() {
        return frames.length;
      },
    };
  }

  it('starts flat and eases the intensity in over the duration (attribute-only updates)', async () => {
    const { attach, encoded } = env();
    const c = clock();
    const h = attach({ appear: 400, now: c.now, animationFrame: c.animationFrame });
    await h.ready;
    const kids = (h.filterElement as unknown as FakeElement).children;
    expect(h.intensity).toBe(0);
    expect(kids[1].getAttribute('scale')).toBe('0');
    expect(c.pending).toBe(1); // the entrance queued its first frame on ready
    c.advance(200);
    await h.refresh();
    expect(h.intensity).toBeCloseTo(0.875, 6); // ease-out cubic at t = 0.5
    expect(kids[1].getAttribute('scale')).toBe('157.5');
    c.advance(200);
    await h.refresh();
    expect(h.intensity).toBe(1);
    expect(kids[1].getAttribute('scale')).toBe('180');
    expect(c.pending).toBe(0);
    expect(encoded).toHaveLength(1);
  });

  it('appear() replays; a manual setIntensity supersedes a running entrance', async () => {
    const { attach } = env();
    const c = clock();
    const h = attach({ now: c.now, animationFrame: c.animationFrame });
    await h.ready;
    expect(h.intensity).toBe(1);
    const done = h.appear(100);
    await h.refresh();
    expect(h.intensity).toBe(0);
    c.advance(50);
    await h.refresh();
    expect(h.intensity).toBeCloseTo(0.875, 6);
    await h.setIntensity(1);
    c.advance(50); // the stale frame runs but must not touch intensity
    await done;
    await h.refresh();
    expect(h.intensity).toBe(1);
    expect(c.pending).toBe(0);
  });

  it('respects prefers-reduced-motion by snapping to full intensity', async () => {
    const { attach } = env();
    const c = clock();
    const h = attach({
      appear: 400,
      now: c.now,
      animationFrame: c.animationFrame,
      matchMedia: (q) => new FakeMediaQueryList(q.includes('reduced-motion')) as unknown as MediaQueryList,
    });
    await h.ready;
    await h.refresh();
    expect(h.intensity).toBe(1);
    expect(c.pending).toBe(0);
  });

  it('frost mode has no entrance to play', async () => {
    const { attach } = env();
    const c = clock();
    const h = attach({ support: 'frost', appear: 400, now: c.now, animationFrame: c.animationFrame });
    await h.ready;
    await h.appear(400);
    expect(h.intensity).toBe(1);
    expect(c.pending).toBe(0);
  });

  it('destroy during the entrance stops it cleanly', async () => {
    const { attach } = env();
    const c = clock();
    const h = attach({ appear: 400, now: c.now, animationFrame: c.animationFrame });
    await h.ready;
    c.advance(100);
    h.destroy();
    c.advance(300);
    expect(c.pending).toBe(0);
    expect(h.destroyed).toBe(true);
  });
});

describe('attachLiquidGlass (reduced transparency)', () => {
  it('overlays more tint and blur and no dispersion; follows the media query', async () => {
    const { attach } = env();
    const mql = new FakeMediaQueryList(true);
    const h = attach({ dispersion: 2, tint: 0.1, matchMedia: () => mql as unknown as MediaQueryList });
    await h.ready;
    expect(h.params.tint).toBe(0.35);
    expect(h.params.blur).toBe(1.5);
    expect(h.params.dispersion).toBe(0);

    await h.update({ tint: 0.2 }); // consumer values are kept under the overlay
    expect(h.params.tint).toBe(0.35);

    mql.set(false);
    await h.update({});
    expect(h.params.tint).toBe(0.2);
    expect(h.params.dispersion).toBe(2);
    expect(h.params.blur).toBe(0.2);

    mql.set(true);
    await h.update({});
    expect(h.params.tint).toBe(0.35);
    h.destroy();
    expect(mql.listeners).toHaveLength(0);
  });

  it('a boolean overrides the media query, and the frost blur grows with it', async () => {
    const { target, attach } = env();
    const mql = new FakeMediaQueryList(false);
    const h = attach({ support: 'frost', reducedTransparency: true, matchMedia: () => mql as unknown as MediaQueryList });
    await h.ready;
    expect(h.params.tint).toBe(0.35);
    expect(target.style.backdropFilter).toBe('blur(25.2px) saturate(1)'); // 12 + 8 + (1.5 - 0.2) * 4
    expect(mql.listeners).toHaveLength(0);
  });
});
