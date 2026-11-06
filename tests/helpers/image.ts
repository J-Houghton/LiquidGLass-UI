export type ImageLike = { width: number; height: number; data: Uint8ClampedArray };

export function pixel(img: ImageLike, x: number, y: number): [number, number, number, number] {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

/**
 * Per-channel mean over `block`×`block` tiles, row-major, flattened as [r,g,b,a, r,g,b,a, ...].
 * Edge tiles may be partial. Covers every pixel, so a refactor that changes any region shows up.
 */
export function blockMeans(img: ImageLike, block: number, decimals = 3): number[] {
  const bx = Math.ceil(img.width / block);
  const by = Math.ceil(img.height / block);
  const out: number[] = [];
  const f = 10 ** decimals;
  for (let ty = 0; ty < by; ty++) {
    for (let tx = 0; tx < bx; tx++) {
      const sum = [0, 0, 0, 0];
      let n = 0;
      const y1 = Math.min(img.height, (ty + 1) * block);
      const x1 = Math.min(img.width, (tx + 1) * block);
      for (let y = ty * block; y < y1; y++) {
        for (let x = tx * block; x < x1; x++) {
          const i = (y * img.width + x) * 4;
          sum[0] += img.data[i];
          sum[1] += img.data[i + 1];
          sum[2] += img.data[i + 2];
          sum[3] += img.data[i + 3];
          n++;
        }
      }
      for (let c = 0; c < 4; c++) out.push(Math.round((sum[c] / n) * f) / f);
    }
  }
  return out;
}

export function channelMean(img: ImageLike, channel: number, x0: number, y0: number, x1: number, y1: number): number {
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      sum += img.data[(y * img.width + x) * 4 + channel];
      n++;
    }
  }
  return sum / n;
}

export function everyPixel(
  img: ImageLike,
  pred: (r: number, g: number, b: number, a: number, x: number, y: number) => boolean,
): boolean {
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      if (!pred(img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3], x, y)) return false;
    }
  }
  return true;
}
