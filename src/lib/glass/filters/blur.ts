import { el, append } from './core.js';

export const blur = (stdDev: number): import('./core.js').Stage => (f, input) => {
	const n = el('feGaussianBlur', { id: 'kBlur', in: input, stdDeviation: stdDev.toFixed(2), result: 'blurred', 'data-dyn': '1' });
	append(f, n);
	return 'blurred';
};
