import { el, append } from './core.js';
import type { Stage } from './core.js';

/**
 * Create a noise‑based blur stage.  This stage uses SVG turbulence and
 * displacement maps to produce a grainier, more organic blur.  The `kind`
 * selects between a low‑frequency (soft) and high‑frequency (harsh) noise
 * profile.  The strength of the blur is controlled by `stdDev`.
 */
export function noiseBlur(kind: 'low' | 'high', stdDev: number): Stage {
  const baseFrequency = kind === 'low' ? 0.035 : 0.4;
  const numOctaves = kind === 'low' ? 5 : 4;
  const suffix = kind === 'low' ? 'low' : 'high';
  return (f, input) => {
    const noise = el('feTurbulence', {
      type: 'fractalNoise',
      baseFrequency: String(baseFrequency),
      numOctaves: String(numOctaves),
      seed: '7',
      result: `noise_${suffix}`,
      'data-dyn': '1',
    });
    const quant = el('feColorMatrix', {
      in: `noise_${suffix}`,
      type: 'matrix',
      values: '1.8 0 0 0 -0.4  0 1.8 0 0 -0.4  0 0 1.8 0 -0.4  0 0 0 1 0',
      result: `quant_${suffix}`,
      'data-dyn': '1',
    });
    const disp = el('feDisplacementMap', {
      in: input,
      in2: `quant_${suffix}`,
      xChannelSelector: 'R',
      yChannelSelector: 'G',
      scale: (stdDev * 100).toFixed(2),
      result: `refrNoise_${suffix}`,
      'data-dyn': '1',
      // mark this displacement node for noise blur so it can be updated
      // without relying on a global id
      'data-role': 'noiseScale',
    });
    append(f, noise, quant, disp);
    return `refrNoise_${suffix}`;
  };
}