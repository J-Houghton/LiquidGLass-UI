/**
 * Provisional feature detection: true when the browser supports `backdrop-filter` at all.
 *
 * This does NOT prove that `backdrop-filter: url(#svg-filter)` renders (WebKit support for SVG
 * filter references in backdrop-filter is unverified). The exact probe and a fallback strategy
 * are decided by plan step 5.1 once the implementation survey is in; until then treat `true`
 * as "worth trying", not "guaranteed".
 */
export function isLiquidGlassSupported(): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return false;
  return CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
}
