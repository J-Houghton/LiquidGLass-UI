// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from 'vitest';
import { defineLiquidGlassElements, LiquidGlassElement, LiquidGlassFilterElement } from '../../src/elements/index';
import type { RGBAImage } from '../../src/core/image';

const encoded: RGBAImage[] = [];
let n = 0;
const encodeImage = async (img: RGBAImage) => {
  encoded.push(img);
  return `blob:${++n}`;
};

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeAll(() => {
  // happy-dom is not Chromium, so detection would pick the frost fallback; force the glass path.
  defineLiquidGlassElements({ defaults: { encodeImage, revokeImage: () => {}, dpr: 1, support: 'full' } });
});

describe('<liquid-glass-container>', () => {
  it('registers once, idempotently, and under a custom prefix as a subclass', () => {
    expect(customElements.get('liquid-glass-container')).toBe(LiquidGlassElement);
    expect(customElements.get('liquid-glass-filter')).toBe(LiquidGlassFilterElement);
    defineLiquidGlassElements();
    defineLiquidGlassElements({ prefix: 'lg' });
    const Alt = customElements.get('lg-container')!;
    expect(Alt).not.toBe(LiquidGlassElement);
    expect(Object.create(Alt.prototype)).toBeInstanceOf(LiquidGlassElement);
  });

  it('attaches on connect, reads attributes (including 1.x aliases), styles itself', async () => {
    document.body.innerHTML = `<liquid-glass-container id="a" width="200" height="100" radius="20" tint="0.1"
      scale-px="90" physical-scale show-specular blur-std-dev="0.4"></liquid-glass-container>`;
    const el = document.getElementById('a') as LiquidGlassElement;
    expect(el.glass).not.toBeNull();
    await el.glass!.ready;
    const p = el.glass!.params;
    expect([p.width, p.height, p.radius, p.tint]).toEqual([200, 100, 20, 0.1]);
    expect(p.displacementScale).toBe(90);
    expect(p.physicalScale).toBe(true);
    expect(p.specular).toBe(true);
    expect(p.blur).toBe(0.4);
    expect(el.style.width).toBe('200px');
    expect(el.style.borderRadius).toBe('20px');
    expect(el.style.backdropFilter).toBe(`url(#${el.glass!.id}) saturate(1)`);
    expect(el.querySelector('svg filter')!.getAttribute('id')).toBe(el.glass!.id);
    expect(el.width).toBe(200);
    expect(el.blurAmount).toBe(0.4);
    expect(typeof el.blur).toBe('function'); // HTMLElement.blur() is not shadowed
  });

  it('coalesces attribute and property changes into one update', async () => {
    document.body.innerHTML = `<liquid-glass-container id="b"></liquid-glass-container>`;
    const el = document.getElementById('b') as LiquidGlassElement;
    await el.glass!.ready;
    const renders = el.glass!.debug.renders;
    el.setAttribute('blur', '1.5');
    el.refractiveIndex = 1.8;
    el.setAttribute('surface', 'lip');
    await tick();
    await el.glass!.update({});
    expect(el.glass!.params.blur).toBe(1.5);
    expect(el.glass!.params.refractiveIndex).toBe(1.8);
    expect(el.glass!.params.surface).toBe('lip');
    expect(el.glass!.debug.renders).toBe(renders + 1);
  });

  it('debug attribute shows the map overlay; removing it hides it', async () => {
    document.body.innerHTML = `<liquid-glass-container id="c" debug></liquid-glass-container>`;
    const el = document.getElementById('c') as LiquidGlassElement;
    await el.glass!.ready;
    const overlay = el.querySelector('[data-liquid-glass-debug]') as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(overlay.style.backgroundImage).toContain('blob:');
    el.removeAttribute('debug');
    expect(el.querySelector('[data-liquid-glass-debug]')).toBeNull();
  });

  it('destroys on disconnect and re-attaches on reconnect', async () => {
    document.body.innerHTML = `<liquid-glass-container id="d"></liquid-glass-container>`;
    const el = document.getElementById('d') as LiquidGlassElement;
    const first = el.glass!;
    await first.ready;
    el.remove();
    expect(first.destroyed).toBe(true);
    expect(el.glass).toBeNull();
    expect(el.querySelector('svg')).toBeNull();
    document.body.appendChild(el);
    expect(el.glass).not.toBeNull();
    expect(el.glass).not.toBe(first);
    await el.glass!.ready;
    expect(el.querySelector('svg')).not.toBeNull();
  });

  it('reads blur-stage and appear attributes; replayAppear(0) completes instantly', async () => {
    document.body.innerHTML = `<liquid-glass-container id="k" blur-stage="before" appear="300"></liquid-glass-container>`;
    const el = document.getElementById('k') as LiquidGlassElement;
    expect(el.appearMs).toBe(300);
    await el.glass!.ready;
    expect(el.glass!.params.blurStage).toBe('before');
    await el.replayAppear(0);
    expect(el.glass!.intensity).toBe(1);
    el.setAttribute('appear', 'nope');
    expect(el.appearMs).toBeUndefined();
  });

  it('emits liquid-glass:render after each render', async () => {
    document.body.innerHTML = `<liquid-glass-container id="e"></liquid-glass-container>`;
    const el = document.getElementById('e') as LiquidGlassElement;
    let count = 0;
    el.addEventListener('liquid-glass:render', () => count++);
    await el.glass!.ready;
    await el.glass!.update({ tint: 0.3 });
    expect(count).toBe(2);
  });
});

describe('<liquid-glass-filter>', () => {
  it('hosts a filter with the given id and exposes url', async () => {
    document.body.innerHTML = `<liquid-glass-filter id="f" filter-id="my-glass" width="300" height="150" dispersion="1"></liquid-glass-filter>`;
    const el = document.getElementById('f') as LiquidGlassFilterElement;
    expect(el.filter).not.toBeNull();
    expect(el.filterId).toBe('my-glass');
    expect(el.url).toBe('url(#my-glass)');
    await el.filter!.ready;
    expect(document.querySelector('filter#my-glass')).not.toBeNull();
    expect(el.filter!.params.width).toBe(300);
    expect(el.filter!.params.dispersion).toBe(1);
    expect(el.style.backdropFilter).toBe(''); // does not style itself
  });

  it('auto-generates an id when none is given and recreates on filter-id change', async () => {
    document.body.innerHTML = `<liquid-glass-filter id="g"></liquid-glass-filter>`;
    const el = document.getElementById('g') as LiquidGlassFilterElement;
    const first = el.filter!;
    expect(first.id).toMatch(/^lg-\d+$/);
    await first.ready;
    el.filterId = 'renamed';
    expect(first.destroyed).toBe(true);
    expect(el.filter!.id).toBe('renamed');
    await el.filter!.ready;
    expect(document.querySelector('filter#renamed')).not.toBeNull();
    expect(document.querySelector(`filter#${first.id}`)).toBeNull();
  });

  it('updates on attribute changes', async () => {
    document.body.innerHTML = `<liquid-glass-filter id="h" filter-id="upd"></liquid-glass-filter>`;
    const el = document.getElementById('h') as LiquidGlassFilterElement;
    await el.filter!.ready;
    el.setAttribute('blur', '2');
    await tick();
    await el.filter!.update({});
    expect(document.querySelector('filter#upd feGaussianBlur')!.getAttribute('stdDeviation')).toBe('2.00');
  });
});
