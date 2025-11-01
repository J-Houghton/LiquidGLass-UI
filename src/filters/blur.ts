import { el, append } from './core';

export const blur = (stdDev: number): import('./core').Stage => (f, input) => {
	const n = el('feGaussianBlur', { in: input, stdDeviation: stdDev.toFixed(2), result: 'blurred', 'data-dyn': '1' });
	append(f, n);
	return 'blurred';
};
