import { el, append } from './core.js';
import type { Stage } from './core.js';

/**
 * Fast chromatic aberration using simple offsets, masked by the displacement map's Blue channel.
 * This ensures the chromatic effect appears only on the bezel/edges, not the flat center.
 */
export const chromaticFast: Stage = (f, input) => {
  // 1. Extract the Mask from the Map (Blue channel -> Alpha)
  // The map is expected to be available at 'map'
  const mask = el('feColorMatrix', {
    in: 'map', 
    type: 'matrix',
    // R=0, G=0, B=0, A=Blue. This creates an alpha mask from the Blue channel.
    values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0',
    result: 'chromaticMask',
    'data-dyn': '1'
  });

  // 2. Split Input into Channels
  const r = el('feColorMatrix', {
    in: input, type: 'matrix',
    values: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
    result: 'fastR', 'data-dyn': '1'
  });
  const g = el('feColorMatrix', {
    in: input, type: 'matrix',
    values: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
    result: 'fastG', 'data-dyn': '1'
  });
  const b = el('feColorMatrix', {
    in: input, type: 'matrix',
    values: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
    result: 'fastB', 'data-dyn': '1'
  });

  // 3. Offset Red and Blue
  const offR = el('feOffset', {
    in: 'fastR', dx: '0', dy: '0', result: 'offR_shifted',
    'data-dyn': '1', 'data-role': 'offR'
  });
  const offB = el('feOffset', {
    in: 'fastB', dx: '0', dy: '0', result: 'offB_shifted',
    'data-dyn': '1', 'data-role': 'offB'
  });

  // 4. Composite Offsets with Mask (Bezel Area)
  // in operator: Source * DestinationAlpha (where destination is our mask)
  const rBezel = el('feComposite', {
    in: 'offR_shifted', in2: 'chromaticMask', operator: 'in', result: 'rBezel', 'data-dyn': '1'
  });
  const bBezel = el('feComposite', {
    in: 'offB_shifted', in2: 'chromaticMask', operator: 'in', result: 'bBezel', 'data-dyn': '1'
  });

  // 5. Composite Originals with Inverse Mask (Center Area)
  // out operator: Source * (1 - DestinationAlpha)
  const rCenter = el('feComposite', {
    in: 'fastR', in2: 'chromaticMask', operator: 'out', result: 'rCenter', 'data-dyn': '1'
  });
  const bCenter = el('feComposite', {
    in: 'fastB', in2: 'chromaticMask', operator: 'out', result: 'bCenter', 'data-dyn': '1'
  });

  // 6. Combine Bezel + Center for each channel
  // arithmetic k2=1 k3=1 corresponds to A + B
  const finalR = el('feComposite', {
    in: 'rBezel', in2: 'rCenter', operator: 'arithmetic',
    k1: '0', k2: '1', k3: '1', k4: '0', result: 'finalR', 'data-dyn': '1'
  });
  const finalB = el('feComposite', {
    in: 'bBezel', in2: 'bCenter', operator: 'arithmetic',
    k1: '0', k2: '1', k3: '1', k4: '0', result: 'finalB', 'data-dyn': '1'
  });

  // 7. Blend Channels Back Together
  // Green passes through untouched (anchored)
  const blendRG = el('feBlend', {
    in: 'finalR', in2: 'fastG', mode: 'screen', result: 'fastRG', 'data-dyn': '1'
  });
  const blendRGB = el('feBlend', {
    in: 'fastRG', in2: 'finalB', mode: 'screen', result: 'fastRGB', 'data-dyn': '1'
  });

  // 8. Final Alpha Clip (Edge cleanup)
  const alpha = el('feColorMatrix', {
    in: input, type: 'matrix',
    values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
    result: 'fastA', 'data-dyn': '1'
  });
  const final = el('feComposite', {
    in: 'fastRGB', in2: 'fastA', operator: 'in', result: 'chromaticFastOut', 'data-dyn': '1'
  });

  append(f, mask, r, g, b, offR, offB, rBezel, bBezel, rCenter, bCenter, finalR, finalB, blendRG, blendRGB, alpha, final);
  return 'chromaticFastOut';
};