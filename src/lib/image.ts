/** Largest edge sent to Gemini for a reference image. Bigger inputs only bloat the request. */
export const MAX_REFERENCE_EDGE = 1536;
/** Below this, an already-small image is sent as-is. */
const PASS_THROUGH_BYTES = 1_500_000;

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const CHUNK = 0x8000; // keeps String.fromCharCode's argument list small
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

export function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export interface Dimensions {
  width: number;
  height: number;
}

/** Decodes just enough to read the size. Browser only. */
export async function imageDimensions(blob: Blob): Promise<Dimensions> {
  const bmp = await createImageBitmap(blob);
  try {
    return { width: bmp.width, height: bmp.height };
  } finally {
    bmp.close();
  }
}

export const isWidescreen = ({ width, height }: Dimensions, tolerance = 0.03): boolean =>
  height > 0 && Math.abs(width / height - 16 / 9) / (16 / 9) <= tolerance;

export interface PreparedImage {
  mimeType: string;
  /** Base64 without a data: prefix. */
  data: string;
}

/**
 * Gets an image ready to send as a reference: small ones pass through untouched, large ones are scaled down
 * (long edge <= MAX_REFERENCE_EDGE) and re-encoded as JPEG. Browser only.
 */
export async function prepareReference(blob: Blob): Promise<PreparedImage> {
  const bmp = await createImageBitmap(blob);
  try {
    const long = Math.max(bmp.width, bmp.height);
    if (long <= MAX_REFERENCE_EDGE && blob.size <= PASS_THROUGH_BYTES)
      return { mimeType: blob.type || 'image/png', data: await blobToBase64(blob) };

    const scale = Math.min(1, MAX_REFERENCE_EDGE / long);
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process the reference image in this browser.');
    ctx.fillStyle = '#fff'; // JPEG has no alpha; transparent pixels would turn black
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
    if (!out) throw new Error('Could not process the reference image in this browser.');
    return { mimeType: 'image/jpeg', data: await blobToBase64(out) };
  } finally {
    bmp.close();
  }
}
