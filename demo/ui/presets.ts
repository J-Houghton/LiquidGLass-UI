import type { GlassContainerParams } from '../../src/core/defaults.js';

export type Preset = {
  id: string;
  name: string;
  description: string;
  config: Partial<GlassContainerParams>;
};

export const PRESETS: Preset[] = [
  {
    id: 'default',
    name: 'Standard Glass',
    description: 'Balanced refraction and reflection.',
    config: {
      surface: 'convex_squircle',
      radius: 60,
      bezelWidth: 60,
      glassThickness: 50,
      refractiveIndex: 1.5,
      scalePx: 180,
      chromaticBezelFactor: 4,
      frost: 0.05,
      specularStrength: 0.9,
    },
  },
  {
    id: 'heavy-prism',
    name: 'Heavy Prism',
    description: 'Thick glass with strong chromatic aberration.',
    config: {
      surface: 'convex_squircle',
      radius: 40,
      bezelWidth: 40,
      glassThickness: 180,
      refractiveIndex: 1.6,
      dispersion: 1.5,
      chromaticBezelFactor: 2.5,
      scalePx: 250,
      frost: 0,
    },
  },
  {
    id: 'frosted-diffuser',
    name: 'Frosted Diffuser',
    description: 'High roughness/blur for privacy UI.',
    config: {
      surface: 'convex_squircle',
      radius: 20,
      bezelWidth: 2,
      glassThickness: 20,
      refractiveIndex: 1.33,
      blurKind: 'noise1',
      blurStdDev: 1.5,
      frost: 0.4,
      saturation: 1.2,
      scalePx: 50,
    },
  },
  {
    id: 'thin-lens',
    name: 'Thin Lens',
    description: 'High refraction with minimal bezel.',
    config: {
      surface: 'convex_circle',
      radius: 120,
      bezelWidth: 10,
      glassThickness: 10,
      refractiveIndex: 2.1,
      scalePx: 300,
      dispersion: 0.2,
      showSpecular: true,
      specularStrength: 1.5,
    },
  },
  {
    id: 'aerogel',
    name: 'Aerogel',
    description: 'Ghostly, low-contrast, ethereal look.',
    config: {
      surface: 'concave',
      radius: 80,
      bezelWidth: 80,
      glassThickness: 150,
      refractiveIndex: 1.1,
      frost: 0.1,
      saturation: 0.5,
      specularStrength: 0.3,
      blurKind: 'gauss',
      blurStdDev: 0.5,
    },
  },
  {
    id: 'magnifier',
    name: 'Reading Magnifier',
    description: 'Clean expansion for reading text.',
    config: {
      width: 400,
      height: 100,
      radius: 50,
      bezelWidth: 10,
      glassThickness: 30,
      refractiveIndex: 1.4,
      scalePx: 120, // Negative relative scale often creates zoom depending on implementation, here we rely on standard IOR
      frost: 0,
      dispersion: 0.1,
    }
  }
];

export const BACKGROUNDS = [
  { id: 'grid', name: 'Animated Grid', type: 'css', value: '' }, // Handled by CSS class removal
  { id: 'neon', name: 'Neon City', type: 'img', value: 'https://images.unsplash.com/photo-1557672172-298e090bd0f1?q=80&w=1600&auto=format&fit=crop' },
  { id: 'nature', name: 'Ferns', type: 'img', value: 'https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?q=80&w=1600&auto=format&fit=crop' },
  { id: 'geo', name: 'Geometry', type: 'img', value: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=1600&auto=format&fit=crop' },
  { id: 'text', name: 'Typography', type: 'img', value: 'https://images.unsplash.com/photo-1618411533504-7fabc00a113a?q=80&w=1600&auto=format&fit=crop' },
]; 