import { createRGBAImage, type RGBAImage } from '../image.js';

/**
 * The magnifying map (`magnify`, after kube.io's lens). R and G fall in a straight line from one
 * side of the lens to the other, so a displacement through it draws every point from nearer the
 * middle, by an amount that grows with its distance from there: a uniform zoom. The shorter side's
 * ramp is cut in proportion, so the zoom is the same both ways. Only the lens's proportions matter,
 * so the image is small and the filter stretches it over the lens (a straight ramp stretches exactly).
 */
export function zoomMap(width: number, height: number, size = 64): RGBAImage {
  const long = Math.max(width, height, 1);
  const ax = Math.max(0, width) / long;
  const ay = Math.max(0, height) / long;
  const img = createRGBAImage(size, size);
  for (let j = 0; j < size; j++) {
    // -1 at the top .. 1 at the bottom, at the pixel's center
    const v = ((j + 0.5) / size) * 2 - 1;
    for (let i = 0; i < size; i++) {
      const u = ((i + 0.5) / size) * 2 - 1;
      const k = (j * size + i) * 4;
      img.data[k] = 128 - 127 * ax * u;
      img.data[k + 1] = 128 - 127 * ay * v;
      img.data[k + 2] = 128;
      img.data[k + 3] = 255;
    }
  }
  return img;
}
