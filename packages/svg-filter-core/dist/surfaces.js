/**
 * Definitions of parametric surface profiles used to shape the bezel of the glass.
 * Each profile is provided as a function mapping the unit interval [0,1] to a
 * normalized height, where 0 corresponds to the outer edge of the bezel and 1
 * corresponds to the inner edge bordering the flat glass.
 *
 * These surfaces mirror the originals from the Lit based implementation but are
 * exported as plain functions for reuse in any environment (Node, browser, etc).
 */
/** A circular convex profile. */
export const CONVEX_CIRCLE = {
    title: 'Convex Circle',
    fn: (x) => {
        return Math.sqrt(1 - (1 - x) * (1 - x));
    },
};
/** A smooth convex profile shaped like a squircle. */
export const CONVEX_SQUIRCLE = {
    title: 'Convex Squircle',
    fn: (x) => {
        return Math.pow(1 - Math.pow(1 - x, 4), 1 / 4);
    },
};
/** A concave profile – essentially the complement of the circular convex. */
export const CONCAVE = {
    title: 'Concave',
    fn: (x) => {
        // Use the convex circle function and mirror it to create a concave rim.
        return 1 - CONVEX_CIRCLE.fn(x);
    },
};
/** A lip profile combining convex and concave shapes with a smoothstep mix. */
export const LIP = {
    title: 'Lip',
    fn: (x) => {
        // Smoothstep 5th-degree polynomial for blending between convex and concave.
        const t = 6 * x ** 5 - 15 * x ** 4 + 10 * x ** 3;
        const cv = CONVEX_SQUIRCLE.fn(Math.min(1, x * 2));
        const cc = CONCAVE.fn(x) + 0.1;
        return cv * (1 - t) + cc * t;
    },
};
/** Map of all supported surface kinds to their definitions. */
export const SURFACE_FNS = {
    convex_circle: CONVEX_CIRCLE,
    convex_squircle: CONVEX_SQUIRCLE,
    concave: CONCAVE,
    lip: LIP,
};
/**
 * Coerce an arbitrary string into a valid `SurfaceKind`.  If the provided value
 * is not one of the allowed kinds, `convex_squircle` is returned as a safe
 * default.  This helper mirrors the behaviour of the original UI validation.
 */
export function asSurfaceKind(v) {
    const allowed = ['convex_circle', 'convex_squircle', 'concave', 'lip'];
    return (allowed.includes(v) ? v : 'convex_squircle');
}
