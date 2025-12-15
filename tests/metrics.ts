// Banding metrics that work with any ImageData-like object to avoid TS coupling to DOM ImageData.
export type Score = {
  flatFraction: number;    // 0..1, lower is better
  laplacianEnergy: number; // arbitrary units, lower is better
  coverage: number;        // fraction of non-neutral pixels considered
};

type ImageDataLike = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export function scoreDisplacement(
  img: ImageDataLike,
  opts: { tol?: number; neutral?: number } = {}
): Score {
  const { width: W, height: H, data } = img;
  const tol = opts.tol ?? 1;
  const neutral = opts.neutral ?? 128;

  const eq = (a: number, b: number) => Math.abs(a - b) <= tol;
  const active = (i: number) => {
    const r = data[i], g = data[i + 1];
    return Math.abs(r - neutral) > tol || Math.abs(g - neutral) > tol;
  };

  let flats = 0, pairs = 0, activePixels = 0;

  // Neighbor equality in R/G with tolerance, masking out neutral background
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      if (active(idx)) activePixels++;

      if (x + 1 < W) {
        const idxR = (y * W + (x + 1)) * 4;
        if (active(idx) && active(idxR)) {
          if (eq(data[idx + 0], data[idxR + 0])) flats++;
          if (eq(data[idx + 1], data[idxR + 1])) flats++;
          pairs += 2;
        }
      }
      if (y + 1 < H) {
        const idxD = ((y + 1) * W + x) * 4;
        if (active(idx) && active(idxD)) {
          if (eq(data[idx + 0], data[idxD + 0])) flats++;
          if (eq(data[idx + 1], data[idxD + 1])) flats++;
          pairs += 2;
        }
      }
    }
  }

  const flatFraction = pairs ? flats / pairs : 0;
  const coverage = (W * H) ? activePixels / (W * H) : 0;

  // Laplacian energy over active interior only
  let energy = 0, count = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = (y * W + x) * 4;
      if (!(active(i) && active(i - 4) && active(i + 4) && active(i - 4 * W) && active(i + 4 * W))) continue;
      for (let c = 0; c < 2; c++) {
        const p = i + c;
        const up = p - 4 * W, down = p + 4 * W, left = p - 4, right = p + 4;
        const lap = 4 * data[p] - data[up] - data[down] - data[left] - data[right];
        energy += Math.abs(lap);
        count++;
      }
    }
  }
  const laplacianEnergy = count ? energy / count : 0;

  return { flatFraction, laplacianEnergy, coverage };
}
