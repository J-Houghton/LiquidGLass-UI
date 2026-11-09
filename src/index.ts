/**
 * liquid-glass-filter: headless entry. Importing this module has no side effects and touches
 * no DOM; the functions do, when called.
 */
export * from './core/index.js';

export type { GlassFilterOptions, GlassFilterHandle, GlassFilterDebug, GlassLightLayer, LensPlacement } from './dom/createGlassFilter.js';
export {
  createGlassFilter,
  nextGlassId,
  splitGlassOptions,
  budgetedDpr,
  bucketSize,
  DEFAULT_MAX_MAP_PIXELS,
  DEFAULT_MAX_LIGHT_PIXELS,
  DEFAULT_SIZE_BUCKET,
  SIZE_BUCKET_MIN,
} from './dom/createGlassFilter.js';

export type { LiquidGlassOptions, LiquidGlassHandle, GlassFallback, GlassMode, AppearOptions } from './dom/attachLiquidGlass.js';
export { attachLiquidGlass, reducedTransparencyParams, easeOutCubic, CONTENT_FILTER_MAX_PX } from './dom/attachLiquidGlass.js';

export type { ImageEncoder, UrlRevoker } from './dom/encodeImage.js';
export { encodeImageToBlobUrl, revokeBlobUrl } from './dom/encodeImage.js';

export { MapRegistry, defaultMapRegistry, revokeLensUrls } from './dom/mapCache.js';
export type { MapRegistryOptions, LensMapUrls } from './dom/mapCache.js';

export type { ElementFactory } from './dom/mountFilter.js';
export { createFilterSvg, applyFilterSpec } from './dom/mountFilter.js';

export type { GlassMotionOptions, GlassMotionHandle, MotionFrame, MotionGlass, PressMotion, HoverMotion, EnterMotion } from './dom/attachGlassMotion.js';
export { attachGlassMotion } from './dom/attachGlassMotion.js';
export type { GlassLightOptions, GlassLightHandle, LightGlass, SceneLight, PointerLight } from './dom/attachGlassLight.js';
export { attachGlassLight } from './dom/attachGlassLight.js';
export * from './motion/index.js';

export type { GlassSupport, SupportEnvironment } from './dom/support.js';
export {
  detectGlassSupport,
  isLiquidGlassSupported,
  isChromiumEngine,
  isWebKitEngine,
  safariMajorVersion,
  needsFilterIdBump,
  detectContentFilterSupport,
  browserSupportEnvironment,
} from './dom/support.js';
