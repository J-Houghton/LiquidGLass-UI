/**
 * Pure engine: parameters, maps, filter description. No DOM, no globals.
 * Everything here is safe to import and run on a server or in a worker.
 */
export type { GlassParams, ResolvedGlassParams, BlurKind, BlurStage, DispersionUnit, LegacyGlassParams } from './params.js';
export {
  DEFAULT_GLASS_PARAMS,
  GLASS_PARAM_KEYS,
  BLUR_KINDS,
  BLUR_STAGES,
  DISPERSION_UNITS,
  MAP_KEYS,
  resolveGlassParams,
  fromLegacyParams,
} from './params.js';

export type { RGBAImage } from './image.js';
export { createRGBAImage } from './image.js';

export type { SurfaceKind, SurfaceFn, SurfaceDefinition } from './optics/surfaces.js';
export { SURFACE_FNS, SURFACE_KINDS, isSurfaceKind, asSurfaceKind } from './optics/surfaces.js';

export type { DisplacementCurveOptions } from './optics/disp1d.js';
export { displacementCurve } from './optics/disp1d.js';
export type { DisplacementMapOptions } from './optics/disp2d.js';
export { displacementMap, lightMap, lensMaps, maxAbs, densityGain, stretchProfile, RIM_NEUTRAL, LIGHT_NEUTRAL } from './optics/disp2d.js';
export type { LightMapOptions, LensMaps } from './optics/disp2d.js';
export type { SpecularMapOptions } from './optics/specularLight.js';
export { specularMap } from './optics/specularLight.js';
export { lightVector, rimCoefficient, rimThickness } from './optics/rim.js';
export type { BandPixel } from './optics/band.js';
export { forEachBandPixel, inRoundedRect } from './optics/band.js';

export { mapGlassThickness } from './validation/geometry.js';

export type { FilterPrimitive, FilterSpec, FilterRefs, FilterSpecOptions, LensRegion } from './filters/spec.js';
export { buildFilterSpec, filterSpecToSvg, filterElementAttrs, NOISE_SCALE_FACTOR, DISPERSION_SPREAD } from './filters/spec.js';
