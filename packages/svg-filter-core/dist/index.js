/*
 * Public API for the svg-filter-core library.
 *
 * This module re‑exports the surfaces, displacement and specular helpers
 * together with a handful of type definitions.  Consumers can use these
 * functions to generate the data needed for an SVG displacement filter in
 * the browser or on the server.
 */
export { SURFACE_FNS, asSurfaceKind } from './surfaces.js';
export { calculateDisplacementCurve, calculateDisplacementMap2 } from './displacement.js';
export { buildSpecularImage } from './specular.js';
