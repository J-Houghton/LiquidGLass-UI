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
export const CONVEX_CIRCLE: SurfaceDefinition = {
  title: 'Convex Circle',
  fn: (x: number): number => {
    return Math.sqrt(1 - (1 - x) * (1 - x));
  },
};

/** A smooth convex profile shaped like a squircle. */
export const CONVEX_SQUIRCLE: SurfaceDefinition = {
  title: 'Convex Squircle',
  fn: (x: number): number => {
    return Math.pow(1 - Math.pow(1 - x, 4), 1 / 4);
  },
};

/** A concave profile – essentially the complement of the circular convex. */
export const CONCAVE: SurfaceDefinition = {
  title: 'Concave',
  fn: (x: number): number => {
    // Use the convex circle function and mirror it to create a concave rim.
    return 1 - CONVEX_CIRCLE.fn(x);
  },
};

/** A lip profile combining convex and concave shapes with a smoothstep mix. */
export const LIP: SurfaceDefinition = {
  title: 'Lip',
  fn: (x: number): number => {
    // Smoothstep 5th-degree polynomial for blending between convex and concave.
    const t = 6 * x ** 5 - 15 * x ** 4 + 10 * x ** 3;
    const cv = CONVEX_SQUIRCLE.fn(Math.min(1, x * 2));
    const cc = CONCAVE.fn(x) + 0.1;
    return cv * (1 - t) + cc * t;
  },
};

/** Map of all supported surface kinds to their definitions. */
export const SURFACE_FNS: Record<SurfaceKind, SurfaceDefinition> = {
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
export function asSurfaceKind(v: string): SurfaceKind {
  const allowed: SurfaceKind[] = ['convex_circle', 'convex_squircle', 'concave', 'lip'];
  return (allowed.includes(v as SurfaceKind) ? v : 'convex_squircle') as SurfaceKind;
}