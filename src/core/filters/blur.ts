import { el, append } from './core.js';
import type { Stage } from './core.js';

/**
 * Create a Gaussian blur stage.  The standard deviation controls the blur
 * strength.  The stage attaches an `<feGaussianBlur>` element to the filter
 * and returns the result ID for subsequent stages.
 */
export const blur = (stdDev: number): Stage => (f, input) => {
  const n = el('feGaussianBlur', {
    in: input,
    stdDeviation: stdDev.toFixed(2),
    result: 'blurred',
    'data-dyn': '1',
    // Mark this blur node with a role attribute so it can be updated
    // without relying on a global id.  Multiple filters can coexist safely.
    'data-role': 'blur',
  });
  append(f, n);
  return 'blurred';
};