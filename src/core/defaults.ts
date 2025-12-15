// src/core/defaults.ts
import type { SurfaceKind } from './optics/surfaces.js';

export type BlurKind = 'gauss' | 'noise1' | 'noise2';

export type GlassContainerParams = {
  width: number;
  height: number;
  radius: number;
  bezelWidth: number;
  glassThickness: number;
  surface: SurfaceKind;
  refractiveIndex: number;
  scalePx: number;
  blurKind: BlurKind;
  blurStdDev: number;
  showSpecular: boolean;
  specularAngleDeg: number;
  specularStrength: number;
  dispersion: number;
  chromaticBezelFactor: number;
  frost: number;
  saturation: number;
};

export const DEFAULT_GLASS_CONTAINER_PARAMS: GlassContainerParams = {
  width: 300,
  height: 120,
  radius: 60,
  bezelWidth: 60,
  glassThickness: 50,
  surface: 'convex_squircle',
  refractiveIndex: 1.5,
  scalePx: 180,
  blurKind: 'gauss',
  blurStdDev: 0.2,
  showSpecular: true,
  specularAngleDeg: 60,
  specularStrength: 0.9,
  dispersion: 0,
  chromaticBezelFactor: 4, // Default to 25% of bezel
  frost: 0.05,
  saturation: 1,
};

// Demo-specific events (Will be moved to demo folder in a later)
export const CONTAINERS_CHANGED_EVENT = 'demo-stage:containers-changed';
export const REMOVE_CONTAINER_EVENT = 'demo-stage:remove-container';
export const SELECT_CONTAINER_EVENT = 'demo-stage:select-container';