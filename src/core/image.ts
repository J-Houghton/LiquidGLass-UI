/**
 * Plain RGBA pixel buffer. This is what the engine produces; it has no DOM dependency.
 * The DOM layer wraps it in an `ImageData` when it needs to draw it.
 */
export interface RGBAImage {
  readonly width: number;
  readonly height: number;
  /** Row-major RGBA, length = width * height * 4. Backed by a plain ArrayBuffer so it can feed `ImageData`. */
  readonly data: Uint8ClampedArray<ArrayBuffer>;
}

export function createRGBAImage(width: number, height: number): RGBAImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}
