import type { GlassParams } from '../../src/index.js';

export type Preset = {
  id: string;
  name: string;
  description: string;
  config: Partial<GlassParams>;
};

// glassThickness is literal px in 2.0. The 1.x presets went through a smoothstep
// (mapGlassThickness): 50 -> 31.25, 60 -> 43.2, 40 -> 20.8, 80 -> 70.4, 100 -> 100.
// specularStrength was applied twice in 1.x; 2.0 applies it once, so s -> s*min(1,s):
// 0.9 -> 0.81, 0.5 -> 0.25. The values below are those outputs, so every preset renders as in 1.x,
// plus shade 0.35 (edge darkening, new in 2.0; the API default is 0).
export const PRESETS: Preset[] = [
  {
    id: 'surface-squircle',
    name: 'Standard Glass',
    description: 'Convex squircle profile. Balanced refraction.',
    config: {
      surface: 'convex_squircle',
      radius: 60,
      bezelWidth: 60,
      glassThickness: 31.25,
      refractiveIndex: 1.5,
      displacementScale: 180,
      tint: 0.05,
      shade: 0.35,
      specularStrength: 0.81,
    },
  },
  {
    id: 'surface-circle',
    name: 'Optical Lens',
    description: 'Convex circular profile. Strong magnification feel.',
    config: {
      surface: 'convex_circle',
      width: 200,
      height: 200,
      radius: 100,
      bezelWidth: 100,
      glassThickness: 100,
      refractiveIndex: 1.6,
      displacementScale: 100,
      specular: true,
      specularStrength: 1.2,
      tint: 0,
      shade: 0.35,
    },
  },
  {
    id: 'surface-concave',
    name: 'Concave Dish',
    description: 'Inward curve. Shrinks content slightly.',
    config: {
      surface: 'concave',
      radius: 60,
      bezelWidth: 60,
      glassThickness: 43.2,
      refractiveIndex: 1.4,
      displacementScale: 122,
      specularStrength: 0.25,
      tint: 0.1,
      shade: 0.35,
    },
  },
  {
    id: 'surface-lip',
    name: 'Sculpted Lip',
    description: 'Complex "S" profile with a distinct rim.',
    config: {
      surface: 'lip',
      radius: 60,
      bezelWidth: 50,
      glassThickness: 20.8,
      refractiveIndex: 1.5,
      displacementScale: 180,
      specularStrength: 1.0,
      tint: 0.05,
      shade: 0.35,
    },
  },
  {
    id: 'blur-noise-1',
    name: 'School Glass',
    description: 'Coarse, organic distortion. Heavy texture.',
    config: {
      surface: 'convex_squircle',
      radius: 30,
      bezelWidth: 30,
      glassThickness: 70.4,
      refractiveIndex: 1.5,
      blurKind: 'noise1',
      blur: 0.8,
      tint: 0.1,
      shade: 0.35,
      displacementScale: 100,
    },
  },
  {
    id: 'blur-noise-2',
    name: 'Privacy Glass',
    description: 'Fine-grain noise blur. Textured look.',
    config: {
      surface: 'convex_squircle',
      radius: 40,
      bezelWidth: 40,
      glassThickness: 31.25,
      refractiveIndex: 1.45,
      blurKind: 'noise2',
      blur: 0.33,
      tint: 0.1,
      shade: 0.35,
      displacementScale: 60,
    },
  },
];

export const BACKGROUNDS = [
  { id: 'grid', name: 'Animated Grid', type: 'css', value: '' }, // Handled by CSS class removal
  { id: 'neon', name: 'Neon City', type: 'img', value: 'https://images.unsplash.com/photo-1557672172-298e090bd0f1?q=80&w=1600&auto=format&fit=crop' },
  { id: 'nature', name: 'Ferns', type: 'img', value: 'https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?q=80&w=1600&auto=format&fit=crop' },
  { id: 'geo', name: 'Geometry', type: 'img', value: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=1600&auto=format&fit=crop' },
  { id: 'text', name: 'Typography', type: 'img', value: 'https://images.unsplash.com/photo-1618411533504-7fabc00a113a?q=80&w=1600&auto=format&fit=crop' },
];
