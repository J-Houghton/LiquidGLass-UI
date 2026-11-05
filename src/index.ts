/**
 * liquid-glass-filter: headless entry. Importing this module has no side effects and touches
 * no DOM; the functions do, when called.
 */
export * from './core/index.js';

export type { GlassFilterOptions, GlassFilterHandle, GlassFilterDebug } from './dom/createGlassFilter.js';
export { createGlassFilter, nextGlassId, splitGlassOptions } from './dom/createGlassFilter.js';

export type { LiquidGlassOptions, LiquidGlassHandle } from './dom/attachLiquidGlass.js';
export { attachLiquidGlass } from './dom/attachLiquidGlass.js';

export type { ImageEncoder, UrlRevoker } from './dom/encodeImage.js';
export { encodeImageToBlobUrl, revokeBlobUrl } from './dom/encodeImage.js';

export type { ElementFactory } from './dom/mountFilter.js';
export { createFilterSvg, applyFilterSpec } from './dom/mountFilter.js';

export { isLiquidGlassSupported } from './dom/support.js';
