/** A generic representation of image data.  The browser supplies
 * `ImageData` with identical shape, but to remain environment neutral
 * (so tests can run in Node) we use a plain interface here. */
export interface ImageDataLike {
    width: number;
    height: number;
    data: Uint8ClampedArray;
}
/**
 * Compute a one‑dimensional refraction displacement profile across the bezel.
 * Each sample in the returned array represents the horizontal distance a
 * vertically incident light ray travels through the glass material before
 * exiting the opposite surface.
 *
 * The function models Snell's law at the curved bezel interface: given a
 * surface profile function (`bezelHeightFn`) describing the shape of the
 * outer surface from 0 to 1, the routine calculates the surface normal at
 * each sample, refracts a vertical incident ray into the glass using the
 * provided refractive index, then projects the refracted direction over the
 * remaining optical path length (`bezelWidth` + `glassThickness`).
 *
 * A soft knee limiter is applied to avoid extreme displacements near grazing
 * angles.  This curve is later normalized and packed into a 2D displacement
 * map.
 *
 * @param glassThickness  Effective thickness of the interior glass region in px
 * @param bezelWidth      Width of the bezel band in px
 * @param bezelHeightFn   Parametric function describing bezel shape on [0,1]
 * @param refractiveIndex Index of refraction (IOR) for the glass
 * @param samples         Number of discrete samples across the bezel
 */
export declare function calculateDisplacementCurve(glassThickness?: number, bezelWidth?: number, bezelHeightFn?: (x: number) => number, refractiveIndex?: number, samples?: number): number[];
/**
 * Construct a two‑dimensional displacement map for refraction inside a
 * rounded rectangle.  Each pixel in the returned object stores a unit
 * displacement vector pointing opposite the outward normal of the bezel band
 * (packed into the red and green channels with a 128 bias and 127 scale),
 * and a magnitude proportional to a precomputed 1D displacement curve.
 *
 * Pixels outside the bezel band are left unchanged.  The `maximumDisplacement`
 * parameter normalizes the precomputed values so that the map fits within
 * the 8‑bit colour range.
 *
 * @param canvasWidth                 Width of the effect in CSS pixels
 * @param canvasHeight                Height of the effect in CSS pixels
 * @param radius                      Corner radius of the rounded rectangle
 * @param bezelWidth                  Width of the outer bezel band in pixels
 * @param maximumDisplacement         Maximum absolute displacement from the 1D map
 * @param precomputedDisplacementMap  Array of scalar displacements indexed by relative position [0..1] across the bezel
 * @param dpr                         Optional device pixel ratio override; defaults to 1 when not provided
 */
export declare function calculateDisplacementMap2(canvasWidth: number, canvasHeight: number, radius: number, bezelWidth: number, maximumDisplacement: number, precomputedDisplacementMap?: number[], dpr?: number): ImageDataLike;
