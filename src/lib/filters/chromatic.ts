// filters/chromatic.ts
import { el, append } from './core.js';
import type { Stage } from './core.js';

/** Lightweight chromatic split/offset/recombine with single alpha clip. */
export const chromatic: Stage = (f, input) => {
  // Split the incoming image into separate R, G and B channels.  We
  // deliberately avoid assigning global IDs to these primitives so that
  // multiple filters on the same page do not clash.  Instead we mark
  // the offset nodes with data attributes so they can be adjusted later
  // without relying on unique ids.
  const refrR = el('feColorMatrix', {
    in: input,
    type: 'matrix',
    values: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
    result: 'refrR',
    'data-dyn': '1',
  });
  const refrG = el('feColorMatrix', {
    in: input,
    type: 'matrix',
    values: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
    result: 'refrG',
    'data-dyn': '1',
  });
  const refrB = el('feColorMatrix', {
    in: input,
    type: 'matrix',
    values: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
    result: 'refrB',
    'data-dyn': '1',
  });

  // Create per-channel offsets.  Use data-role attributes instead of ids so
  // that these elements can be located relative to the filter root without
  // risk of conflicts between multiple filters.  The offsets will be
  // adjusted in updateParams() on the FilterGraph.
  const offR = el('feOffset', {
    in: 'refrR',
    dx: '0',
    dy: '0',
    result: 'refrR_off',
    'data-dyn': '1',
    'data-role': 'offR',
  });
  const offG = el('feOffset', {
    in: 'refrG',
    dx: '0',
    dy: '0',
    result: 'refrG_off',
    'data-dyn': '1',
    'data-role': 'offG',
  });
  const offB = el('feOffset', {
    in: 'refrB',
    dx: '0',
    dy: '0',
    result: 'refrB_off',
    'data-dyn': '1',
    'data-role': 'offB',
  });

  // Blend the channel offsets back together.
  const blendRG = el('feBlend', {
    in: 'refrR_off',
    in2: 'refrG_off',
    mode: 'screen',
    result: 'refrRG',
    'data-dyn': '1',
  });
  const blendRGB = el('feBlend', {
    in: 'refrRG',
    in2: 'refrB_off',
    mode: 'screen',
    result: 'rgbSum',
    'data-dyn': '1',
  });

  // Extract the alpha channel from the original refracted image.
  const alpha = el('feColorMatrix', {
    in: input,
    type: 'matrix',
    values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
    result: 'refrA',
    'data-dyn': '1',
  });

  // Apply the alpha mask to the recombined RGB image to prevent hard
  // coloured fringes at the edges.
  const rgbClipped = el('feComposite', {
    in: 'rgbSum',
    in2: 'refrA',
    operator: 'in',
    result: 'dispersionRGB',
    'data-dyn': '1',
  });

  // Composite the dispersion layer back over the original input.
  const over = el('feComposite', {
    in: 'dispersionRGB',
    in2: input,
    operator: 'over',
    result: 'refrWithDisp',
    'data-dyn': '1',
  });

  append(f, refrR, refrG, refrB, offR, offG, offB, blendRG, blendRGB, alpha, rgbClipped, over);
  return 'refrWithDisp';
};
