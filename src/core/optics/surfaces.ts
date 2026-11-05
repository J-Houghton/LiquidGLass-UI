/**
 * Parametric bezel profiles. Each maps the unit interval [0,1] to a normalized height,
 * where 0 is the outer rim of the bezel and 1 the inner edge bordering the flat glass.
 * The optics use the profile's slope to compute surface normals and refraction paths.
 */
export type SurfaceKind = 'convex_circle' | 'convex_squircle' | 'concave' | 'lip';

/** Bezel height profile on [0,1] → [0,1]; 0 is the outer rim, 1 the inner edge. */
export type SurfaceFn = (x: number) => number;

export interface SurfaceDefinition {
  title: string;
  fn: SurfaceFn;
}

export const CONVEX_CIRCLE: SurfaceDefinition = {
  title: 'Convex Circle',
  fn: (x) => Math.sqrt(1 - (1 - x) ** 2),
};

export const CONVEX: SurfaceDefinition = {
  title: 'Convex Squircle',
  fn: (x) => Math.pow(1 - Math.pow(1 - x, 4), 1 / 4),
};

export const CONCAVE: SurfaceDefinition = {
  title: 'Concave',
  fn: (x) => 1 - CONVEX_CIRCLE.fn(x),
};

export const LIP: SurfaceDefinition = {
  title: 'Lip',
  fn: (x) => {
    const t = 6 * x ** 5 - 15 * x ** 4 + 10 * x ** 3;
    const cv = CONVEX.fn(Math.min(1, x * 2));
    const cc = CONCAVE.fn(x) + 0.1;
    return cv * (1 - t) + cc * t;
  },
};

export const SURFACE_FNS: Readonly<Record<SurfaceKind, SurfaceDefinition>> = {
  convex_circle: CONVEX_CIRCLE,
  convex_squircle: CONVEX,
  concave: CONCAVE,
  lip: LIP,
};

export const SURFACE_KINDS = Object.keys(SURFACE_FNS) as readonly SurfaceKind[];

export function isSurfaceKind(v: unknown): v is SurfaceKind {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(SURFACE_FNS, v);
}

/**
 * Coerce an arbitrary string into a valid `SurfaceKind`, falling back to `convex_squircle`.
 */
export function asSurfaceKind(v: string): SurfaceKind {
  return isSurfaceKind(v) ? v : 'convex_squircle';
}
