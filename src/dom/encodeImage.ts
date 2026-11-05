import type { RGBAImage } from '../core/image.js';

/** Turns a pixel buffer into a URL an `<feImage href>` can load. */
export type ImageEncoder = (img: RGBAImage) => Promise<string>;
/** Releases a URL produced by an {@link ImageEncoder}. */
export type UrlRevoker = (url: string) => void;

/** Default encoder: PNG blob URL via a scratch canvas. Browser only. */
export const encodeImageToBlobUrl: ImageEncoder = async (img) => {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('liquid-glass: 2D canvas context not available');
  ctx.putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('liquid-glass: canvas.toBlob returned null'))), 'image/png'),
  );
  return URL.createObjectURL(blob);
};

/** Default revoker: releases blob URLs, ignores anything else (data URLs, test stubs). */
export const revokeBlobUrl: UrlRevoker = (url) => {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url);
};
