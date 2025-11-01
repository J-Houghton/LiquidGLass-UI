import { el, append } from './core';

// Expects caller to provide image href separately via DOM id #specImage if needed.
// This stage just wires gain + blend on top of input stream.
export const specular = (gain = 1): import('./core').Stage => (f, input) => {
	const specAdj = el('feComponentTransfer', { in: 'specSrc', result: 'specAdj', 'data-dyn': '1' });
	const funcA = el('feFuncA', { id: 'specGain', type: 'linear', slope: gain.toString(), 'data-dyn': '1' });
	// const funcA = el('feFuncA', { type: 'linear', slope: gain.toString(), 'data-dyn': '1' });
	specAdj.appendChild(funcA);
	const mix = el('feBlend', { in: input, in2: 'specAdj', mode: 'screen', result: 'final', 'data-dyn': '1' });
	append(f, specAdj, mix);
	return 'final';
};
