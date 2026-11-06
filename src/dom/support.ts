/**
 * Support detection for `backdrop-filter: url(#svg-filter)`.
 *
 * `CSS.supports` alone cannot answer this: support is defined at parse level, and both WebKit and
 * Gecko parse the value yet render nothing for a filter graph with `feImage` + `feDisplacementMap`
 * (WebKit drops the whole backdrop-filter list at compositing; Gecko ignores graphs that fall back
 * to its blob path). As of late 2026 only Chromium renders it, so, like every library in the field,
 * this is a parse check for `url()` plus an engine check. A page can override the verdict with
 * `<html data-liquid-glass-support="force|off">`. Revisit when WebKit's software path ships.
 */

export type GlassSupport =
  /** Chromium with backdrop-filter: the SVG lens renders. */
  | 'full'
  /** backdrop-filter exists but SVG filter references do not render (Safari, Firefox). */
  | 'frost'
  /** No backdrop-filter at all. */
  | 'none';

export interface SupportEnvironment {
  /** `navigator.userAgent`. */
  userAgent?: string;
  /** `navigator.userAgentData.brands[].brand`, when the browser exposes Client Hints. */
  brands?: readonly string[];
  /** `CSS.supports(property, value)`. */
  supports?: (property: string, value: string) => boolean;
  /** Page-level override: `<html data-liquid-glass-support="force|off">`. */
  override?: 'force' | 'off' | null;
}

/** Chromium-based engine? Client Hints brands when present, UA string otherwise. */
export function isChromiumEngine(env: SupportEnvironment): boolean {
  if (env.brands && env.brands.length > 0) {
    return env.brands.some((b) => /chromium|google chrome|microsoft edge|opera|brave/i.test(b));
  }
  const ua = env.userAgent ?? '';
  // "Chrome/" is present in Chrome, Chromium Edge ("Edg/"), Opera and Brave UAs. Legacy EdgeHTML
  // also claimed "Chrome/" but added "Edge/"; iOS Chrome says "CriOS/" and is WebKit underneath.
  return /\bChrome\/\d+/.test(ua) && !/\bEdge\/\d+/.test(ua);
}

function safeSupports(env: SupportEnvironment, property: string, value: string): boolean {
  try {
    return env.supports?.(property, value) ?? false;
  } catch {
    return false;
  }
}

const supportsEither = (env: SupportEnvironment, value: string): boolean =>
  safeSupports(env, 'backdrop-filter', value) || safeSupports(env, '-webkit-backdrop-filter', value);

/** Read the current browser's environment. Safe to call without a DOM (everything is optional). */
export function browserSupportEnvironment(): SupportEnvironment {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const uad = (nav as unknown as { userAgentData?: { brands?: { brand: string }[] } } | undefined)?.userAgentData;
  const css = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' ? CSS : undefined;
  const attr = typeof document !== 'undefined' ? document.documentElement?.getAttribute('data-liquid-glass-support') : null;
  return {
    userAgent: nav?.userAgent,
    brands: uad?.brands?.map((b) => b.brand),
    supports: css ? (p, v) => css.supports(p, v) : undefined,
    override: attr === 'force' || attr === 'off' ? attr : null,
  };
}

/** Classify what the current (or given) environment can render. */
export function detectGlassSupport(env: SupportEnvironment = browserSupportEnvironment()): GlassSupport {
  if (env.override === 'force') return 'full';
  if (env.override === 'off') return 'frost';
  if (!supportsEither(env, 'blur(1px)')) return 'none';
  if (!supportsEither(env, 'url(#x)')) return 'frost';
  return isChromiumEngine(env) ? 'full' : 'frost';
}

/** True when the SVG lens is expected to render (Chromium with backdrop-filter). */
export function isLiquidGlassSupported(env?: SupportEnvironment): boolean {
  return detectGlassSupport(env) === 'full';
}

// ---- content-side `filter: url()` --------------------------------------------------------------

/** WebKit that is not Chromium: Safari and every iOS browser. */
export function isWebKitEngine(env: SupportEnvironment): boolean {
  if (isChromiumEngine(env)) return false;
  if (env.brands && env.brands.length > 0) return false; // Client Hints are a Chromium feature
  return /\bAppleWebKit\//.test(env.userAgent ?? '');
}

/** Safari's major version from the `Version/N` UA token, or null (iOS WebViews omit it). */
export function safariMajorVersion(env: SupportEnvironment): number | null {
  const m = /\bVersion\/(\d+)/.exec(env.userAgent ?? '');
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Does `filter: url(#id)` need a fresh id whenever its primitives change? Safari before 27.0 did
 * not repaint otherwise (fixed in Safari 27.0, 2026-09-17); a WebKit of unknown version is assumed
 * affected.
 */
export function needsFilterIdBump(env: SupportEnvironment = browserSupportEnvironment()): boolean {
  if (!isWebKitEngine(env)) return false;
  const v = safariMajorVersion(env);
  return v === null || v < 27;
}

/**
 * Can the lens render through `filter: url()` on an element that owns the pixels? Chromium,
 * WebKit and Gecko all do (the latter on a CPU path), so this is the parse check plus the page
 * override.
 */
export function detectContentFilterSupport(env: SupportEnvironment = browserSupportEnvironment()): boolean {
  if (env.override === 'force') return true;
  if (env.override === 'off') return false;
  return safeSupports(env, 'filter', 'url(#x)');
}
