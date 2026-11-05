import { DEFAULT_GLASS_PARAMS, type ResolvedGlassParams } from '../core/params.js';
import { createGlassFilter, type GlassFilterHandle, type GlassFilterOptions } from './createGlassFilter.js';

export interface LiquidGlassOptions extends Omit<GlassFilterOptions, 'radius' | 'onRender'> {
  /**
   * Where the effect size comes from. `'observe'` (default) measures the target's border box
   * and follows it with a ResizeObserver; an object fixes it.
   */
  size?: 'observe' | { width: number; height: number };
  /**
   * Corner radius in px, or `'css'` (default) to read the target's computed `border-radius`
   * (px values only; anything else falls back to the default radius).
   */
  radius?: number | 'css';
  /**
   * Write `backdrop-filter`, `-webkit-backdrop-filter`, `background-color` (the tint) and,
   * when `radius` is a number, `border-radius` onto the target. Default true. Previous inline
   * values are restored on destroy.
   */
  applyStyles?: boolean;
  /** ResizeObserver implementation (test seam). Default: the global one, if any. */
  resizeObserver?: typeof ResizeObserver;
  onRender?: (handle: LiquidGlassHandle) => void;
}

export interface LiquidGlassHandle extends GlassFilterHandle {
  readonly target: HTMLElement;
  /**
   * The inline style the effect needs on the target, as CSSStyleDeclaration keys
   * (`backdropFilter`, `WebkitBackdropFilter`, `backgroundColor`, maybe `borderRadius`).
   * Useful with `applyStyles: false`, e.g. React `style={handle.getStyle()}`.
   */
  getStyle(): Readonly<Record<string, string>>;
}

const STYLE_KEYS = ['backdropFilter', 'WebkitBackdropFilter', 'backgroundColor', 'borderRadius'] as const;
type StyleKey = (typeof STYLE_KEYS)[number];

function readCssRadius(target: HTMLElement): number | undefined {
  if (typeof getComputedStyle !== 'function') return undefined;
  const v = getComputedStyle(target).borderTopLeftRadius;
  const m = /^(\d+(?:\.\d+)?)px$/.exec(v ?? '');
  return m ? parseFloat(m[1]) : undefined;
}

function measure(target: HTMLElement): { width: number; height: number } {
  const r = target.getBoundingClientRect();
  return { width: Math.round(r.width), height: Math.round(r.height) };
}

/**
 * Attach the glass effect to an element: creates the filter, sizes it to the element, and
 * (by default) applies the `backdrop-filter` styles. Returns a handle with `update`/`destroy`.
 * Safe to import anywhere; call it only where a DOM exists (e.g. inside an effect).
 */
export function attachLiquidGlass(target: HTMLElement, options: LiquidGlassOptions = {}): LiquidGlassHandle {
  const { size = 'observe', radius = 'css', applyStyles = true, resizeObserver, onRender, ...filterOptions } = options;

  const radiusPx = typeof radius === 'number' ? radius : (readCssRadius(target) ?? DEFAULT_GLASS_PARAMS.radius);
  let initialSize = size === 'observe' ? measure(target) : size;
  if (initialSize.width <= 0 || initialSize.height <= 0) {
    // Not laid out yet (or display:none): start from the given/default size; the observer corrects it.
    initialSize = {
      width: filterOptions.width ?? DEFAULT_GLASS_PARAMS.width,
      height: filterOptions.height ?? DEFAULT_GLASS_PARAMS.height,
    };
  }

  const saved: Partial<Record<StyleKey, string>> = {};
  if (applyStyles) {
    const style = target.style as unknown as Record<string, string>;
    for (const k of STYLE_KEYS) saved[k] = style[k] ?? '';
  }

  const styleFor = (p: ResolvedGlassParams, url: string): Record<string, string> => {
    const bf = `${url} saturate(${p.saturation})`;
    const out: Record<string, string> = {
      backdropFilter: bf,
      WebkitBackdropFilter: bf,
      backgroundColor: `rgba(0, 0, 0, ${p.tint})`,
    };
    if (typeof radius === 'number') out.borderRadius = `${p.radius}px`;
    return out;
  };

  let handle!: LiquidGlassHandle;

  const inner = createGlassFilter(target, {
    ...filterOptions,
    width: initialSize.width,
    height: initialSize.height,
    radius: radiusPx,
    onRender: () => {
      if (applyStyles) {
        const style = target.style as unknown as Record<string, string>;
        for (const [k, v] of Object.entries(styleFor(inner.params, inner.url))) style[k] = v;
      }
      onRender?.(handle);
    },
  });

  let observer: ResizeObserver | null = null;
  const RO = resizeObserver ?? (typeof ResizeObserver !== 'undefined' ? ResizeObserver : undefined);
  if (size === 'observe' && RO) {
    observer = new RO((entries) => {
      const entry = entries[entries.length - 1];
      const box = entry?.borderBoxSize?.[0];
      const next = box
        ? { width: Math.round(box.inlineSize), height: Math.round(box.blockSize) }
        : measure(target);
      if (next.width > 0 && next.height > 0) void inner.update(next);
    });
    observer.observe(target);
  }

  function destroy(): void {
    if (inner.destroyed) return;
    observer?.disconnect();
    observer = null;
    if (applyStyles) {
      const style = target.style as unknown as Record<string, string>;
      for (const k of STYLE_KEYS) style[k] = saved[k] ?? '';
    }
    inner.destroy();
  }

  handle = {
    get id() {
      return inner.id;
    },
    get url() {
      return inner.url;
    },
    get filterElement() {
      return inner.filterElement;
    },
    get svgElement() {
      return inner.svgElement;
    },
    get params() {
      return inner.params;
    },
    get dpr() {
      return inner.dpr;
    },
    get destroyed() {
      return inner.destroyed;
    },
    ready: inner.ready,
    debug: inner.debug,
    target,
    update: (patch) => inner.update(patch),
    refresh: () => inner.refresh(),
    setDpr: (d) => inner.setDpr(d),
    getStyle: () => styleFor(inner.params, inner.url),
    destroy,
  };
  return handle;
}
