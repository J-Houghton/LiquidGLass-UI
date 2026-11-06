/**
 * liquid-glass-filter: headless entry. Importing this module has no side effects and touches
 * no DOM; the functions do, when called.
 */
export * from './core/index.js';

export type { GlassFilterOptions, GlassFilterHandle, GlassFilterDebug } from './dom/createGlassFilter.js';
export { createGlassFilter, nextGlassId, splitGlassOptions, budgetedDpr, DEFAULT_MAX_MAP_PIXELS } from './dom/createGlassFilter.js';

export type { LiquidGlassOptions, LiquidGlassHandle, GlassFallback, AppearOptions } from './dom/attachLiquidGlass.js';
export { attachLiquidGlass, reducedTransparencyParams, easeOutCubic } from './dom/attachLiquidGlass.js';

export type { ImageEncoder, UrlRevoker } from './dom/encodeImage.js';
export { encodeImageToBlobUrl, revokeBlobUrl } from './dom/encodeImage.js';

export { MapRegistry, defaultMapRegistry } from './dom/mapCache.js';
export type { MapRegistryOptions } from './dom/mapCache.js';

export type { ElementFactory } from './dom/mountFilter.js';
export { createFilterSvg, applyFilterSpec } from './dom/mountFilter.js';

export type { GlassSupport, SupportEnvironment } from './dom/support.js';
export { detectGlassSupport, isLiquidGlassSupported, isChromiumEngine, browserSupportEnvironment } from './dom/support.js';
