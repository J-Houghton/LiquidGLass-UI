import { DEFAULT_GLASS_PARAMS, GLASS_PARAM_KEYS, resolveGlassParams, type GlassParams, type ResolvedGlassParams } from '../core/params.js';
import { createGlassFilter, splitGlassOptions, type GlassFilterHandle, type GlassFilterOptions } from './createGlassFilter.js';
import { createFilterSvg, type ElementFactory } from './mountFilter.js';
import { detectGlassSupport, type GlassSupport } from './support.js';

export type GlassFallback =
  /** When the SVG lens cannot render: CSS blur + tint + rim hint, no maps generated. Default. */
  | 'frost'
  /** Attach the SVG filter regardless of detection. */
  | 'none';

export interface AppearOptions {
  /** Duration of the entrance, ms. */
  duration: number;
  /** Easing on [0,1]. Default: ease-out cubic. */
  easing?: (t: number) => number;
}

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
   * Write `backdrop-filter`, `-webkit-backdrop-filter`, `background-color` (the tint), the frost
   * rim `box-shadow` and, when `radius` is a number, `border-radius` onto the target. Default true.
   * Previous inline values are restored on destroy.
   */
  applyStyles?: boolean;
  /** What to do where SVG backdrop filters do not render (Safari, Firefox). Default 'frost'. */
  fallback?: GlassFallback;
  /** Override support detection (tests, or a deployment you know). */
  support?: GlassSupport;
  /** Blur radius of the frost fallback, CSS px. Default 12. */
  frostBlurPx?: number;
  /**
   * Frostier, higher-contrast glass (Apple's Reduce Transparency contract): more tint and blur, no
   * dispersion. `'auto'` (default) follows `prefers-reduced-transparency` where the browser exposes
   * it (Chromium; Safari does not); pass a boolean to drive it from your own setting.
   */
  reducedTransparency?: boolean | 'auto';
  /**
   * Entrance animation: the lens eases in from flat glass over this many ms (a number, or
   * `{ duration, easing }`). Attribute-only updates, no map work. Skipped under
   * `prefers-reduced-motion`. Re-run any time with `handle.appear()`. Default: none.
   */
  appear?: number | AppearOptions;
  /** ResizeObserver implementation (test seam). Default: the global one, if any. */
  resizeObserver?: typeof ResizeObserver;
  /** `matchMedia` implementation (test seam). Default: `window.matchMedia`, if any. */
  matchMedia?: (query: string) => MediaQueryList;
  /** `requestAnimationFrame` implementation (test seam). Default: the global one, if any. */
  animationFrame?: (callback: (time: number) => void) => unknown;
  /** Clock for animations (test seam). Default: `performance.now`. */
  now?: () => number;
  onRender?: (handle: LiquidGlassHandle) => void;
}

export interface LiquidGlassHandle extends GlassFilterHandle {
  readonly target: HTMLElement;
  /** `'glass'` when the SVG filter renders, `'frost'` when the CSS fallback is in use. */
  readonly mode: 'glass' | 'frost';
  /** What detection concluded (or what `support` overrode it with). */
  readonly support: GlassSupport;
  /**
   * The inline style the effect needs on the target, as CSSStyleDeclaration keys
   * (`backdropFilter`, `WebkitBackdropFilter`, `backgroundColor`, `boxShadow`, maybe `borderRadius`).
   * Useful with `applyStyles: false`, e.g. React `style={handle.getStyle()}`.
   */
  getStyle(): Readonly<Record<string, string>>;
  /**
   * Play the entrance: intensity 0 → 1 over `durationMs` (default: the `appear` option's duration,
   * or 400). Resolves when it finishes or is superseded. Instant under reduced motion / frost mode.
   */
  appear(durationMs?: number): Promise<void>;
}

const STYLE_KEYS = ['backdropFilter', 'WebkitBackdropFilter', 'backgroundColor', 'boxShadow', 'borderRadius'] as const;
type StyleKey = (typeof STYLE_KEYS)[number];
const DATA_ATTR = 'data-liquid-glass';
const DEFAULT_APPEAR_MS = 400;

/** Parameter overlay for reduced transparency. */
export function reducedTransparencyParams(p: Partial<GlassParams>): Partial<GlassParams> {
  return {
    ...p,
    tint: Math.max(p.tint ?? DEFAULT_GLASS_PARAMS.tint, 0.35),
    blur: Math.max(p.blur ?? DEFAULT_GLASS_PARAMS.blur, 1.5),
    dispersion: 0,
  };
}

/** Ease-out cubic, the entrance curve hyalite and most UI toolkits use. */
export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

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
 * Attach the glass effect to an element: detects support, creates the filter (or the frost
 * fallback), sizes it to the element, and by default applies the styles. Returns a handle with
 * `update`/`destroy`. Safe to import anywhere; call it only where a DOM exists.
 */
export function attachLiquidGlass(target: HTMLElement, options: LiquidGlassOptions = {}): LiquidGlassHandle {
  const {
    size = 'observe',
    radius = 'css',
    applyStyles = true,
    fallback = 'frost',
    frostBlurPx = 12,
    reducedTransparency = 'auto',
    appear: appearOption,
    resizeObserver,
    matchMedia: mm,
    animationFrame,
    now: nowOption,
    onRender,
    ...filterOptions
  } = options;

  const support = options.support ?? detectGlassSupport();
  const mode: 'glass' | 'frost' = support === 'full' || fallback === 'none' ? 'glass' : 'frost';

  const matchMediaFn = mm ?? (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : undefined);
  let reducedQuery: MediaQueryList | null = null;
  let reduced = false;
  if (reducedTransparency === 'auto') {
    reducedQuery = matchMediaFn?.('(prefers-reduced-transparency: reduce)') ?? null;
    reduced = reducedQuery?.matches ?? false;
  } else {
    reduced = reducedTransparency;
  }

  const appearConfig: AppearOptions | null =
    appearOption === undefined ? null : typeof appearOption === 'number' ? { duration: appearOption } : appearOption;
  const raf =
    animationFrame ??
    (typeof requestAnimationFrame === 'function' ? (cb: (time: number) => void) => requestAnimationFrame(cb) : undefined);
  const now = nowOption ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));

  const radiusPx = typeof radius === 'number' ? radius : (readCssRadius(target) ?? DEFAULT_GLASS_PARAMS.radius);
  let initialSize = size === 'observe' ? measure(target) : size;
  if (initialSize.width <= 0 || initialSize.height <= 0) {
    // Not laid out yet (or display:none): start from the given/default size; the observer corrects it.
    initialSize = {
      width: filterOptions.width ?? DEFAULT_GLASS_PARAMS.width,
      height: filterOptions.height ?? DEFAULT_GLASS_PARAMS.height,
    };
  }

  // What the consumer asked for, before the reduced-transparency overlay.
  const { params: initialParams, rest } = splitGlassOptions(filterOptions);
  let userParams: Partial<GlassParams> = { ...initialParams, width: initialSize.width, height: initialSize.height, radius: radiusPx };
  const effective = (p: Partial<GlassParams>): Partial<GlassParams> => (reduced ? reducedTransparencyParams(p) : p);

  const saved: Partial<Record<StyleKey, string>> = {};
  const styleTarget = target.style as unknown as Record<string, string>;
  if (applyStyles) for (const k of STYLE_KEYS) saved[k] = styleTarget[k] ?? '';

  const styleFor = (p: ResolvedGlassParams, url: string): Record<string, string> => {
    const out: Record<string, string> = {};
    if (mode === 'glass') {
      const bf = `${url} saturate(${p.saturation})`;
      out.backdropFilter = bf;
      out.WebkitBackdropFilter = bf;
    } else {
      const blur = frostBlurPx + (reduced ? 8 : 0) + Math.max(0, p.blur - DEFAULT_GLASS_PARAMS.blur) * 4;
      const bf = `blur(${Math.round(blur * 10) / 10}px) saturate(${p.saturation})`;
      out.backdropFilter = bf;
      out.WebkitBackdropFilter = bf;
      if (p.specular) out.boxShadow = `inset 0 0 0 1px rgba(255, 255, 255, ${Math.round(Math.min(1, p.specularStrength) * 0.35 * 100) / 100})`;
    }
    out.backgroundColor = `rgba(0, 0, 0, ${p.tint})`;
    if (typeof radius === 'number') out.borderRadius = `${p.radius}px`;
    return out;
  };

  const applyTargetStyles = (p: ResolvedGlassParams, url: string) => {
    if (!applyStyles) return;
    const style = styleFor(p, url);
    for (const k of STYLE_KEYS) styleTarget[k] = style[k] ?? saved[k] ?? '';
    target.setAttribute(DATA_ATTR, mode);
  };

  let handle!: LiquidGlassHandle;

  const inner: GlassFilterHandle =
    mode === 'glass'
      ? createGlassFilter(target, {
          ...(rest as GlassFilterOptions),
          ...effective(userParams),
          // start flat when an entrance is requested, so the first paint has nothing to undo
          intensity: appearConfig && appearConfig.duration > 0 ? 0 : (rest as GlassFilterOptions).intensity,
          onRender: () => {
            applyTargetStyles(inner.params, inner.url);
            onRender?.(handle);
          },
        })
      : createFrostHandle(target, rest as GlassFilterOptions, effective(userParams), () => {
          applyTargetStyles(inner.params, inner.url);
          onRender?.(handle);
        });

  function update(patch: Partial<GlassParams>): Promise<void> {
    for (const k of GLASS_PARAM_KEYS) if (patch[k] !== undefined) (userParams as Record<string, unknown>)[k] = patch[k];
    return inner.update(effective(patch));
  }

  const onReducedChange = (e: MediaQueryListEvent) => {
    reduced = e.matches;
    // Re-send the overlaid keys explicitly so turning the overlay off restores the consumer's
    // values (or the defaults) instead of leaving the overlay's numbers in place.
    void inner.update(
      effective({
        tint: DEFAULT_GLASS_PARAMS.tint,
        blur: DEFAULT_GLASS_PARAMS.blur,
        dispersion: DEFAULT_GLASS_PARAMS.dispersion,
        ...userParams,
      }),
    );
  };
  reducedQuery?.addEventListener('change', onReducedChange);

  // ---- entrance animation
  let appearToken = 0;
  function appear(durationMs: number = appearConfig?.duration ?? DEFAULT_APPEAR_MS): Promise<void> {
    const token = ++appearToken;
    if (inner.destroyed) return Promise.resolve();
    const reducedMotion = matchMediaFn?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    if (mode !== 'glass' || !raf || !(durationMs > 0) || reducedMotion) return inner.setIntensity(1);
    const easing = appearConfig?.easing ?? easeOutCubic;
    const start = now();
    void inner.setIntensity(0);
    return new Promise<void>((resolve) => {
      const step = () => {
        if (token !== appearToken || inner.destroyed) return resolve();
        const t = Math.min(1, (now() - start) / durationMs);
        void inner.setIntensity(easing(t));
        if (t < 1) raf(step);
        else resolve();
      };
      raf(step);
    });
  }
  if (appearConfig && appearConfig.duration > 0) void inner.ready.then(() => appear(appearConfig.duration));

  let observer: ResizeObserver | null = null;
  const RO = resizeObserver ?? (typeof ResizeObserver !== 'undefined' ? ResizeObserver : undefined);
  if (mode === 'glass' && size === 'observe' && RO) {
    observer = new RO((entries) => {
      const entry = entries[entries.length - 1];
      const box = entry?.borderBoxSize?.[0];
      const next = box ? { width: Math.round(box.inlineSize), height: Math.round(box.blockSize) } : measure(target);
      if (next.width > 0 && next.height > 0) void update(next);
    });
    observer.observe(target);
  }

  function destroy(): void {
    if (inner.destroyed) return;
    appearToken += 1;
    observer?.disconnect();
    observer = null;
    reducedQuery?.removeEventListener('change', onReducedChange);
    if (applyStyles) {
      for (const k of STYLE_KEYS) styleTarget[k] = saved[k] ?? '';
      target.removeAttribute(DATA_ATTR);
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
    get intensity() {
      return inner.intensity;
    },
    get destroyed() {
      return inner.destroyed;
    },
    ready: inner.ready,
    debug: inner.debug,
    target,
    mode,
    support,
    update,
    refresh: () => inner.refresh(),
    setDpr: (d) => inner.setDpr(d),
    setIntensity: (k) => {
      appearToken += 1; // a manual intensity wins over a running entrance
      return inner.setIntensity(k);
    },
    appear,
    getStyle: () => styleFor(inner.params, inner.url),
    destroy,
  };
  return handle;
}

/**
 * The frost fallback behind the same handle shape: no maps, no filter primitives, just resolved
 * parameters driving CSS. Keeps an empty `<svg><filter>` shell so `filterElement`/`url` exist.
 */
function createFrostHandle(
  target: HTMLElement,
  options: GlassFilterOptions,
  initial: Partial<GlassParams>,
  onRender: () => void,
): GlassFilterHandle {
  const doc: ElementFactory = options.document ?? (target.ownerDocument as unknown as ElementFactory);
  const id = options.id ?? `lg-frost-${Math.random().toString(36).slice(2, 8)}`;
  const { svg, filter } = createFilterSvg(doc, id);
  (options.mount ?? target).appendChild(svg);

  let raw: GlassParams = { ...DEFAULT_GLASS_PARAMS, ...initial };
  let params = resolveGlassParams(raw);
  let destroyed = false;
  let dpr = options.dpr ?? 1;
  let intensity = 1;
  const debug = { mapUrl: null, mapDpr: dpr, physicalMaxDisplacementPx: 0, displacementPx: 0, renders: 0 };

  let scheduled: Promise<void> | null = null;
  const render = (): Promise<void> => {
    if (destroyed) return Promise.resolve();
    if (!scheduled) {
      scheduled = Promise.resolve().then(() => {
        scheduled = null;
        if (destroyed) return;
        debug.renders += 1;
        onRender();
      });
    }
    return scheduled;
  };

  const handle: GlassFilterHandle = {
    id,
    url: `url(#${id})`,
    filterElement: filter,
    svgElement: svg,
    get params() {
      return params;
    },
    get dpr() {
      return dpr;
    },
    get intensity() {
      return intensity;
    },
    get destroyed() {
      return destroyed;
    },
    ready: render(),
    debug,
    update(patch) {
      if (destroyed) return Promise.resolve();
      let changed = false;
      const next = { ...raw };
      for (const k of GLASS_PARAM_KEYS) {
        const v = patch[k];
        if (v !== undefined && v !== next[k]) {
          (next as unknown as Record<string, unknown>)[k] = v;
          changed = true;
        }
      }
      if (!changed && debug.renders > 0 && !scheduled) return Promise.resolve();
      raw = next;
      params = resolveGlassParams(raw);
      return render();
    },
    refresh: render,
    setDpr(next) {
      if (Number.isFinite(next) && next > 0) dpr = next;
      return Promise.resolve();
    },
    setIntensity(k) {
      intensity = Number.isFinite(k) ? Math.min(1, Math.max(0, k)) : 1;
      return Promise.resolve();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      svg.remove();
    },
  };
  return handle;
}
