import { el, append } from './core.js';
import type { Stage } from './core.js';

/**
 * Apply a specular highlight over the refracted image.  This stage assumes
 * that a separate `<feImage>` element with `result="specSrc"` is present in
 * the filter definition.  The highlight intensity is controlled by the
 * `gain` parameter, which is mapped to the slope of a `feFuncA` transfer.
 */
export const specular = (gain: number = 1): Stage => (f, input) => {
  // The specular highlight source is expected to be bound to `specSrc`.
  const specAdj = el('feComponentTransfer', {
    in: 'specSrc',
    result: 'specAdj',
    'data-dyn': '1',
  });
  // Expose an id on the alpha adjustment node so that FilterGraph.updateParams()
  // can tweak the specular strength dynamically.
  const funcA = el('feFuncA', {
    type: 'linear',
    slope: gain.toString(),
    'data-dyn': '1',
    // Mark this node for specular gain so it can be updated without a global id
    'data-role': 'specGain',
  });
  specAdj.appendChild(funcA);
  const mix = el('feBlend', {
    in: input,
    in2: 'specAdj',
    mode: 'screen',
    result: 'final',
    'data-dyn': '1',
  });
  append(f, specAdj, mix);
  return 'final';
};