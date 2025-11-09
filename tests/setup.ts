// Node test environment bootstrap.
// 1) Provide a structural ImageData compatible class with colorSpace to satisfy TS lib.dom.d.ts
// 2) Ensure Uint8ClampedArray exists in older Node runtimes

declare global {
  interface ImageDataLike {
    readonly width: number;
    readonly height: number;
    readonly data: Uint8ClampedArray;
    readonly colorSpace?: string;
  }
}

if (typeof (globalThis as any).ImageData === 'undefined') {
  class ImageDataPolyfill {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
    readonly colorSpace = 'srgb';
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  }
  (globalThis as any).ImageData = ImageDataPolyfill as unknown as ImageData;
}
