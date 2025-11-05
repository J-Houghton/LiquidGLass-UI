import { el, append } from './core.js';
import type { Stage } from './core.js';

/** Fractal-noise → quantize → displacement (scale tied to blur stdDev). */
export function noiseBlur(kind: 'low' | 'high', stdDev: number): Stage {
    const baseFrequency = kind === 'low' ? 0.035 : 0.4;
    const numOctaves    = kind === 'low' ? 5     : 4;
    const suffix        = kind === 'low' ? 'low' : 'high';

  return (f, input) => {
    const noise = el('feTurbulence', {
        type: 'fractalNoise',
        baseFrequency: String(baseFrequency),
        numOctaves: String(numOctaves),
        seed: '7',
        result: `noise_${suffix}`,
        'data-dyn': '1'
    });

    const quant = el('feColorMatrix', {
        in: `noise_${suffix}`,
        type: 'matrix',
        result: `quant_${suffix}`,
        'data-dyn': '1',
        values: '1.8 0 0 0 -0.4  0 1.8 0 0 -0.4  0 0 1.8 0 -0.4  0 0 0 1 0'
    });

    const disp = el('feDisplacementMap', {
        in: input, in2: `quant_${suffix}`,
        xChannelSelector: 'R', yChannelSelector: 'G',
        scale: (stdDev * 100).toFixed(2),
        result: `refrNoise_${suffix}`,
        'data-dyn': '1'
    }); 
    disp.setAttribute('id', 'kNoiseScale'); 
    append(f, noise, quant, disp);
    return `refrNoise_${suffix}`;
  };
}
