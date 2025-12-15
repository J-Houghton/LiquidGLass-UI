import type { GlassContainerParams } from '../../src/core/defaults.js';

export type Preset = {
  id: string;
  name: string;
  description: string;
  config: Partial<GlassContainerParams>;
};

export const PRESETS: Preset[] = [
  // 1. Surface: Squircle (Standard)
  {
    id: 'surface-squircle',
    name: 'Standard Glass',
    description: 'Convex squircle profile. Balanced refraction.',
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
  // 2. Surface: Circle (Lens)
  {
    id: 'surface-circle',
    name: 'Optical Lens',
    description: 'Convex circular profile. Strong magnification feel.',
    config: {
      surface: 'convex_circle',
      width: 200,
      height: 200, // Circle shape
      radius: 100,
      bezelWidth: 100, // Full dome
      glassThickness: 100,
      refractiveIndex: 1.6,
      scalePx: 100,
      showSpecular: true,
      specularStrength: 1.2,
      frost: 0,
    },
  },
  // 3. Surface: Concave
  {
    id: 'surface-concave',
    name: 'Concave Dish',
    description: 'Inward curve. Shrinks content slightly.',
    config: {
      surface: 'concave',
      radius: 60,
      bezelWidth: 60,
      glassThickness: 60,
      refractiveIndex: 1.4,
      scalePx: 122,
      specularStrength: 0.5,
      frost: 0.1,
    },
  },
  // 4. Surface: Lip
  {
    id: 'surface-lip',
    name: 'Sculpted Lip',
    description: 'Complex "S" profile with a distinct rim.',
    config: {
      surface: 'lip',
      radius: 60,
      bezelWidth: 50,
      glassThickness: 40,
      refractiveIndex: 1.5,
      scalePx: 180,
      specularStrength: 1.0,
      frost: 0.05,
    },
  },
  // 5. Blur: Noise 1 (Coarse)
  {
    id: 'blur-noise-1',
    name: 'School Glass',
    description: 'Coarse, organic distortion. Heavy texture.',
    config: {
      surface: 'convex_squircle',
      radius: 30,
      bezelWidth: 30,
      glassThickness: 80,
      refractiveIndex: 1.5,
      blurKind: 'noise1',
      blurStdDev: 0.8,
      frost: 0.1,
      scalePx: 100, // Higher displacement for the "wet" look
    },
  },
  
  // 6. Blur: Noise 2 (Fine)
  {
    id: 'blur-noise-2',
    name: 'Privacy Glass',
    description: 'Fine-grain noise blur. Textured look.',
    config: {
      surface: 'convex_squircle',
      radius: 40,
      bezelWidth: 40,
      glassThickness: 50,
      refractiveIndex: 1.45,
      blurKind: 'noise2',
      blurStdDev: 0.33,
      frost: 0.1,
      scalePx: 60,
    },
  }
];



export const BACKGROUNDS = [
  { id: 'grid', name: 'Animated Grid', type: 'css', value: '' }, // Handled by CSS class removal
  { id: 'neon', name: 'Neon City', type: 'img', value: 'https://images.unsplash.com/photo-1557672172-298e090bd0f1?q=80&w=1600&auto=format&fit=crop' },
  { id: 'nature', name: 'Ferns', type: 'img', value: 'https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?q=80&w=1600&auto=format&fit=crop' },
  { id: 'geo', name: 'Geometry', type: 'img', value: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=1600&auto=format&fit=crop' },
  { id: 'text', name: 'Typography', type: 'img', value: 'https://images.unsplash.com/photo-1618411533504-7fabc00a113a?q=80&w=1600&auto=format&fit=crop' },
]; 