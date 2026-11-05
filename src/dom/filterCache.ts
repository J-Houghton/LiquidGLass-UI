import type { RGBAImage } from '../core/image.js';

/**
 * Legacy module-level cache used by the Lit components. Shared by every instance, which is
 * a known defect (plan §1.5 #1); replaced by a per-handle cache in Phase 3 and deleted with
 * the components in Phase 4.
 */
export const cache: {
  dispKey: string | null;
  dispUrl: string | null;
  specKey: string | null;
  specUrl: string | null;
} = {
  dispKey: null,
  dispUrl: null,
  specKey: null,
  specUrl: null,
};

/**
 * Encode an RGBA buffer as a PNG blob URL via a scratch canvas. The caller owns the URL and
 * must revoke it.
 */
export async function imageDataToBlobURL(img: RGBAImage): Promise<string> {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas context not available');
  ctx.putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  const blob: Blob = await new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))), 'image/png');
  });
  return URL.createObjectURL(blob);
}
