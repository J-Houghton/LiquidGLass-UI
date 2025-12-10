import type { ImageDataLike } from './displacement.js';
/**
 * Build a grayscale specular highlight image.
 * Pixels outside the bezel band are fully transparent.  The highlight is
 * packed into both the RGB and alpha channels so that when composited
 * additively the light appears bright.  This function matches the behaviour
 * of the original `buildSpecularImage`.
 *
 * @param objectWidth  Width of the object in CSS pixels
 * @param objectHeight Height of the object in CSS pixels
 * @param radius       Corner radius of the rounded rectangle
 * @param bezelWidth   Width of the bezel band in pixels
 * @param angleDeg     Direction of incoming light measured in degrees
 * @param strength     Overall multiplier for highlight brightness
 * @param dpr          Optional device pixel ratio; defaults to 1 when omitted
 * @param outerSpecThicknessPx Gaussian falloff width at the rim in CSS px
 */
export declare function buildSpecularImage(objectWidth: number, objectHeight: number, radius: number, bezelWidth: number, angleDeg: number, strength?: number, dpr?: number, outerSpecThicknessPx?: number): ImageDataLike;
