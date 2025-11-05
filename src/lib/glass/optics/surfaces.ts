/**
 * Definitions of parametric surface profiles used to shape the bezel of the glass.
 * Each profile is provided as a function mapping the unit interval [0,1] to a normalized height, 
 * 	where 0 corresponds to the outer edge of the bezel and 1 corresponds to the inner edge bordering the flat glass.
 *
 * The surface functions are used by the optical algorithms to compute normals and refraction paths.
 * 
 * Four kinds are provided: 
 *  - `convex_circle`: describes a circular arc. 
 * 
 *  - `convex_squircle`: uses a higher order squircle (power of 4) to give
 *    a flatter start and sharper peak than a simple circle, producing a
 *    squarish bulge.
 * 
 *  - `concave`: inverts the circular profile to create an inward dish.
 * 
 *  - `lip`: blends between the convex squircle and a slight concave shape
 *    using a smooth Hermite interpolation (smoothstep) to create a lip on
 *    the outer rim.
 * 
 * See https://kube.io/blog/liquid-glass-css-svg for detailed info, the optics routines are heavly inspried from the blog  
 */
export type SurfaceKind = 'convex_circle' | 'convex_squircle' | 'concave' | 'lip';
type Surf = { title: string; fn: (x: number) => number };

export const CONVEX_CIRCLE: Surf = { title: 'Convex Circle', fn: (x: number) => Math.sqrt(1 - (1 - x) ** 2) };
export const CONVEX: Surf = { title: 'Convex Squircle', fn: (x: number) => Math.pow(1 - Math.pow(1 - x, 4), 1 / 4) };
export const CONCAVE: Surf = { title: 'Concave', fn: (x: number) => 1 - CONVEX_CIRCLE.fn(x) };
export const LIP: Surf = {
	title: 'Lip', fn: (x: number) => {
		const t = 6 * x ** 5 - 15 * x ** 4 + 10 * x ** 3;
		const cv = CONVEX.fn(Math.min(1, x * 2));
		const cc = CONCAVE.fn(x) + 0.1;
		return cv * (1 - t) + cc * t;
	}
};

export const SURFACE_FNS: Record<SurfaceKind, Surf> = {
	convex_circle: CONVEX_CIRCLE, convex_squircle: CONVEX, concave: CONCAVE, lip: LIP
}; 

export const asSurfaceKind = (v: string): SurfaceKind => {
  const allowed: SurfaceKind[] = [
    'convex_circle',
    'convex_squircle',
    'concave',
    'lip',
  ];
  return (allowed.includes(v as SurfaceKind) ? v : 'convex_squircle') as SurfaceKind;
};