// Node test environment bootstrap: provide a structural ImageData so core code that
// constructs DOM ImageData runs under Node. Removed in plan step 1.2 once core returns
// plain RGBAImage buffers.
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
