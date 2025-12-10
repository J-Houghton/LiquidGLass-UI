/**
 * Definitions of parametric surface profiles used to shape the bezel of the glass.
 * Each profile is provided as a function mapping the unit interval [0,1] to a
 * normalized height, where 0 corresponds to the outer edge of the bezel and 1
 * corresponds to the inner edge bordering the flat glass.
 *
 * These surfaces mirror the originals from the Lit based implementation but are
 * exported as plain functions for reuse in any environment (Node, browser, etc).
 */
export type SurfaceKind = 'convex_circle' | 'convex_squircle' | 'concave' | 'lip';
export interface SurfaceDefinition {
    /** Human readable label for UI display. */
    title: string;
    /** Function describing the bezel height over x ∈ [0,1]. */
    fn: (x: number) => number;
}
/** A circular convex profile. */
export declare const CONVEX_CIRCLE: SurfaceDefinition;
/** A smooth convex profile shaped like a squircle. */
export declare const CONVEX_SQUIRCLE: SurfaceDefinition;
/** A concave profile – essentially the complement of the circular convex. */
export declare const CONCAVE: SurfaceDefinition;
/** A lip profile combining convex and concave shapes with a smoothstep mix. */
export declare const LIP: SurfaceDefinition;
/** Map of all supported surface kinds to their definitions. */
export declare const SURFACE_FNS: Record<SurfaceKind, SurfaceDefinition>;
/**
 * Coerce an arbitrary string into a valid `SurfaceKind`.  If the provided value
 * is not one of the allowed kinds, `convex_squircle` is returned as a safe
 * default.  This helper mirrors the behaviour of the original UI validation.
 */
export declare function asSurfaceKind(v: string): SurfaceKind;
