// A simple cache to avoid recomputing displacement and specular maps for
// identical parameter sets.  Each key encodes the relevant inputs, and
// associated blob URLs are held until invalidated by a change.  When
// recreating a map the old URL is revoked to release memory.
export const cache: {
  dispKey: string | null;
  dispUrl: string | null;
  dispImg: ImageData | null;
  maskKey: string | null;
  maskUrl: string | null;
  specKey: string | null;
  specUrl: string | null;
  rimKey: string | null;
  rimUrl: string | null;
} = {
  dispKey: null,
  dispUrl: null,
  dispImg: null,
  maskKey: null,
  maskUrl: null,
  specKey: null,
  specUrl: null,
  rimKey: null,
  rimUrl: null,
};

/**
 * Convert an `ImageData` into a blob URL.  This function creates a
 * temporary canvas, writes the pixels and uses `toBlob()` to obtain a
 * PNG.  The resulting `Blob` is turned into an object URL which the
 * caller must eventually revoke.
 */
export async function imageDataToBlobURL(imgData: ImageData): Promise<string> {
  const c = document.createElement('canvas');
  c.width = imgData.width;
  c.height = imgData.height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas context not available');
  ctx.putImageData(imgData, 0, 0);
  const blob: Blob = await new Promise((resolve, reject) => {
    if (typeof c.toBlob === 'function') {
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))), 'image/png');
    } else {
      try {
        const dataUrl = c.toDataURL('image/png');
        const bin = atob(dataUrl.split(',')[1]);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        resolve(new Blob([arr], { type: 'image/png' }));
      } catch (e) {
        reject(e as Error);
      }
    }
  });
  return URL.createObjectURL(blob);
}