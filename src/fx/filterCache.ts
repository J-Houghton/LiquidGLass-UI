// blob URL caching to avoid per-frame base64 work
export const cache: {
  dispKey: string | null; dispUrl: string | null; dispImg: ImageData | null;
  maskKey: string | null; maskUrl: string | null;
  specKey: string | null; specUrl: string | null;
  rimKey: string | null;  rimUrl: string | null;
} = {
  dispKey: null, dispUrl: null, dispImg: null,
  maskKey: null, maskUrl: null,
  specKey: null, specUrl: null,
  rimKey: null,  rimUrl: null
}

export async function imageDataToBlobURL(imgData: ImageData): Promise<string> {
    const c = document.createElement('canvas');
    c.width = imgData.width; c.height = imgData.height;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('2D canvas context not available');
    ctx.putImageData(imgData, 0, 0);
    const blob: Blob = await new Promise((resolve, reject) => {
      if (typeof c.toBlob === 'function') {
        c.toBlob(b => b ? resolve(b) : reject(new Error('toBlob returned null')), 'image/png');
      } else {
        try {
          const dataUrl = c.toDataURL('image/png');
          const bin = atob(dataUrl.split(',')[1]);
          const arr = new Uint8Array(bin.length);
          for (let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
          resolve(new Blob([arr], { type: 'image/png' }));
        } catch (e) { reject(e as Error); }
      }
    });
    return URL.createObjectURL(blob); 
}