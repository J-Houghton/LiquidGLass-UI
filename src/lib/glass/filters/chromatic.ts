import { el, append } from './core.js';

// Split RGB, optional offsets, blend back over original.
// in → "refrWithDisp"  
export const chromatic: import('./core.js').Stage = (f, input) => {
	const refrR = el('feColorMatrix', {
		in: input, type: 'matrix',
		values: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
		result: 'refrR', 'data-dyn': '1'
	});
	const refrG = el('feColorMatrix', {
		in: input, type: 'matrix',
		values: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
		result: 'refrG', 'data-dyn': '1'
	});
	const refrB = el('feColorMatrix', {
		in: input, type: 'matrix',
		values: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
		result: 'refrB', 'data-dyn': '1'
	});
	const offR = el('feOffset', { id: 'offR', in: 'refrR', dx: '0', dy: '0', result: 'refrR_off', 'data-dyn': '1' });
	const offG = el('feOffset', { id: 'offG', in: 'refrG', dx: '0', dy: '0', result: 'refrG_off', 'data-dyn': '1' });
	const offB = el('feOffset', { id: 'offB', in: 'refrB', dx: '0', dy: '0', result: 'refrB_off', 'data-dyn': '1' });
	const blendRG = el('feBlend', { in: 'refrR_off', in2: 'refrG_off', mode: 'screen', result: 'refrRG', 'data-dyn': '1' });
	const blendRGB = el('feBlend', { in: 'refrRG', in2: 'refrB_off', mode: 'screen', result: 'dispersionRGB', 'data-dyn': '1' });
	const over = el('feComposite', { in: 'dispersionRGB', in2: input, operator: 'over', result: 'refrWithDisp', 'data-dyn': '1' });
	append(f, refrR, refrG, refrB, offR, offG, offB, blendRG, blendRGB, over);
	return 'refrWithDisp';
};
